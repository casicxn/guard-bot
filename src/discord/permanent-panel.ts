import { randomBytes, createHash } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type Message,
  type InteractionEditReplyOptions,
  type TextChannel,
  type NewsChannel,
} from "discord.js";
import { z } from "zod";
import type { Logger } from "pino";
import type { Store, Incident, WhitelistEntry } from "../contracts.js";
import type { ManagementControls } from "../control/contracts.js";
import { subscribeChanges } from "../change-events.js";
import { createEmbed } from "./embeds.js";
import { createProtectionControl } from "../control/protection.js";
import { isHostileIncident } from "../security/activity.js";
import { recentActivityText } from "./activity-presentation.js";
import { UserError } from "./errors.js";
import { languageFor, t, moduleName } from "../locales/index.js";
import { Sessions, type Session } from "./sessions.js";
import { isSection, type Section } from "./panels.js";

const snowflake = z.string().regex(/^[1-9]\d{16,19}$/);
const viewSchema = z.object({
  section: z.string(),
  page: z.number().int().nonnegative().optional(),
  moduleId: z.string().optional(),
  backupId: z.string().optional(),
  scope: z.string().optional(),
  group: z.string().optional(),
  view: z.string().optional(),
  filter: z.string().optional(),
  jobId: z.string().optional(),
});
const recordSchema = z.object({
  version: z.literal(1),
  panelChannelId: snowflake,
  panelMessageId: snowflake,
  panelCreatedAt: z.number().int().nonnegative(),
  panelEnabled: z.boolean(),
  panelLanguage: z.enum(["tr", "en"]),
  status: z.enum(["ready", "unavailable"]),
  recoveryBehavior: z.enum(["manual", "replace"]).optional(),
  view: viewSchema.optional(),
});
export type PermanentPanelRecord = z.infer<typeof recordSchema>;
export const contextualPanelOperations = new Set([
  "toggle",
  "module-mode",
  "module-action",
  "limit-edit",
  "mode-view",
  "response-view",
  "recovery-view",
  "module",
  "group",
]);
export const panelViewSignature = (view: PermanentPanelRecord["view"]) =>
  createHash("sha256")
    .update(JSON.stringify(viewSchema.parse(view ?? { section: "overview" })))
    .digest("hex")
    .slice(0, 12);
export type PanelRender = (
  guild: Guild,
  userId: string,
  section?: Section,
  page?: number,
  moduleId?: string,
  extra?: Partial<Session>,
) => Promise<InteractionEditReplyOptions>;
interface JsonComponent {
  type?: number;
  custom_id?: string;
  components?: JsonComponent[];
  [key: string]: unknown;
}
export type JsonPanel = {
  content?: string;
  embeds?: Record<string, unknown>[];
  components?: JsonComponent[];
  allowedMentions?: { parse: never[] };
};
export const permanentId = (operation: string) => `ug:v1:panel:${operation}`;
export function isPrivatePanelView(
  view: { section?: string; view?: string } | undefined,
): boolean {
  return Boolean(
    view?.section &&
    (privateSections.has(view.section) ||
      (view.section === "restart" &&
        ["snapshot", "roles", "report"].includes(view.view ?? ""))),
  );
}
export const privateSections = new Set([
  "whitelist",
  "backups",
  "incidents",
  "health",
]);
const errorCode = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? Number(error.code)
    : undefined;
const missing = (error: unknown) =>
  [10003, 10008].includes(errorCode(error) ?? 0) ||
  (error instanceof UserError && error.key === "persistent.channelMissing");

/** One registered message per guild. Durable IDs are independent of temporary modal/confirmation sessions. */
export function createPermanentPanel(
  client: Client,
  store: Store,
  logger: Logger,
  sessions: Sessions,
  controls: ManagementControls,
  render: PanelRender,
) {
  const queues = new Map<string, Promise<unknown>>(),
    timers = new Map<string, ReturnType<typeof setTimeout>>(),
    fingerprints = new Map<string, string>(),
    revisions = new Map<string, number>();
  let ownerId = controls.ownerId,
    disposed = false,
    unsubscribe: (() => void) | undefined;
  let startupTask: Promise<void> | undefined;
  function get(guildId: string): PermanentPanelRecord | undefined {
    const raw = store.get(guildId, "permanent_panel", "main");
    if (raw === undefined) return;
    const parsed = recordSchema.safeParse(raw);
    if (!parsed.success) throw new UserError("persistent.invalidRecord");
    return parsed.data;
  }
  function save(guildId: string, record: PermanentPanelRecord) {
    store.put(guildId, "permanent_panel", "main", recordSchema.parse(record));
  }
  function run<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    if (disposed)
      return Promise.reject(new UserError("persistent.unavailable"));
    const next = (queues.get(guildId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    queues.set(guildId, next);
    void next
      .finally(() => {
        if (queues.get(guildId) === next) queues.delete(guildId);
      })
      .catch(() => undefined);
    return next;
  }
  function assert(actorId: string) {
    controls.authorization.assertOwner(actorId);
    ownerId = actorId;
  }
  const url = (guildId: string, record: PermanentPanelRecord) =>
    `https://discord.com/channels/${guildId}/${record.panelChannelId}/${record.panelMessageId}`;
  async function channel(
    guildId: string,
    channelId: string,
  ): Promise<TextChannel | NewsChannel> {
    const guild = await client.guilds.fetch({ guild: guildId, force: true });
    const destination = await guild.channels.fetch(channelId, { force: true });
    if (!destination) throw new UserError("persistent.channelMissing");
    if (
      !destination ||
      destination.guildId !== guildId ||
      ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(
        destination.type,
      )
    )
      throw new UserError("persistent.channelInvalid");
    const me = await guild.members.fetchMe({ force: true });
    if (
      !destination
        .permissionsFor(me)
        ?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ])
    )
      throw new UserError("persistent.permissions");
    return destination as TextChannel | NewsChannel;
  }
  async function registered(
    guildId: string,
    record: PermanentPanelRecord,
  ): Promise<Message> {
    const destination = await channel(guildId, record.panelChannelId);
    const message = await destination.messages.fetch({
      message: record.panelMessageId,
      force: true,
    });
    if (
      !client.user ||
      message.author.id !== client.user.id ||
      message.guildId !== guildId ||
      message.channelId !== record.panelChannelId
    )
      throw new UserError("persistent.wrongAuthor");
    return message;
  }
  function sessionIn(
    payload: InteractionEditReplyOptions,
    userId: string,
    guildId: string,
  ): Session | undefined {
    const json = JSON.parse(JSON.stringify(payload)) as JsonPanel;
    for (const row of json.components ?? [])
      for (const component of row.components ?? []) {
        const match = /^guard:[a-z-]+:([a-f0-9]{24})$/.exec(
          component.custom_id ?? "",
        );
        if (match) return sessions.get(match[1]!, userId, guildId);
      }
    return undefined;
  }
  function annotatePrivate(
    payload: InteractionEditReplyOptions,
    userId: string,
    guildId: string,
    record: PermanentPanelRecord,
  ): void {
    const state = sessionIn(payload, userId, guildId);
    if (state) {
      state.panelMessageId = record.panelMessageId;
      state.panelChannelId = record.panelChannelId;
    }
  }
  function tools(guildId: string): InteractionEditReplyOptions {
    const language = languageFor(store, guildId);
    return {
      embeds: [
        createEmbed(language, {
          title: t(language, "persistent.tools"),
          description: t(language, "persistent.toolsBody"),
        }),
      ],
      components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(permanentId("panel-move"))
            .setPlaceholder(t(language, "persistent.moveChoose"))
            .setChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setMaxValues(1),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(permanentId("back"))
            .setLabel(t(language, "common.back"))
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(permanentId("panel-pin"))
            .setLabel(t(language, "persistent.pin"))
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(permanentId("main"))
            .setLabel(t(language, "control.main"))
            .setStyle(ButtonStyle.Primary),
        ),
      ],
      allowedMentions: { parse: [] },
    };
  }
  async function publicPayload(
    guild: Guild,
    payload: InteractionEditReplyOptions,
    actorId: string,
  ): Promise<{ payload: JsonPanel; view: PermanentPanelRecord["view"] }> {
    const state = sessionIn(payload, actorId, guild.id),
      language = languageFor(store, guild.id);
    const view = viewSchema.parse({
      section: state?.section ?? "overview",
      page: state?.page,
      moduleId: state?.moduleId,
      backupId: state?.backupId,
      scope: state?.scope,
      group: state?.group,
      view: state?.view,
      filter: state?.filter,
      jobId: state?.jobId,
    });
    const json = JSON.parse(JSON.stringify(payload)) as JsonPanel;
    delete (json as Record<string, unknown>).flags;
    json.allowedMentions = { parse: [] };
    const transient = new Set<string>();
    for (const row of json.components ?? [])
      for (const component of row.components ?? []) {
        const route = /^guard:([a-z-]+):([a-f0-9]{24})$/.exec(
          component.custom_id ?? "",
        );
        if (route) {
          component.custom_id =
            permanentId(route[1]!) +
            (contextualPanelOperations.has(route[1]!)
              ? `:${panelViewSignature(view)}`
              : "");
          transient.add(route[2]!);
        }
      }
    for (const token of transient) sessions.consume(token);
    if (isPrivatePanelView(view)) {
      const entries = store
        .list<WhitelistEntry>(guild.id, "whitelist")
        .filter((entry) => !entry.expiresAt || entry.expiresAt > Date.now());
      const count =
        view.section === "whitelist"
          ? entries.length
          : view.section === "backups"
            ? store.list(guild.id, "backups").length
            : view.section === "incidents"
              ? store
                  .list<Incident>(guild.id, "incidents")
                  .filter(isHostileIncident).length
              : undefined;
      json.embeds = [
        createEmbed(language, {
          title: t(language, `control.section.${view.section}`),
          description:
            view.section === "restart"
              ? t(language, "restart.privateSummary")
              : view.section === "health"
                ? t(language, "persistent.healthSummary")
                : t(language, "persistent.privateSummary", {
                    count: count ?? t(language, "common.unknown"),
                  }),
          tone: "info",
        }).toJSON() as unknown as Record<string, unknown>,
      ];
      json.components = (json.components ?? []).slice(0, 2);
      for (const row of json.components)
        if (row.components)
          row.components = row.components.filter(
            (component) =>
              ![permanentId("prev"), permanentId("next")].includes(
                component.custom_id ?? "",
              ),
          );
      json.components.push(
        new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(permanentId("private-open"))
              .setLabel(t(language, "persistent.privateOpen"))
              .setStyle(ButtonStyle.Primary),
          )
          .toJSON() as unknown as JsonComponent,
      );
      delete view.backupId;
      delete view.jobId;
    }
    if (view.section === "overview") {
      const entries = store
        .list<WhitelistEntry>(guild.id, "whitelist")
        .filter((entry) => !entry.expiresAt || entry.expiresAt > Date.now());
      const incidents = store.list<Incident>(guild.id, "incidents");
      const hostile = incidents.filter(isHostileIncident);
      const last = hostile
        .filter((incident) => incident.confidence === "confirmed")
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      const config = store.getConfig(guild.id);
      const protection = await createProtectionControl(
        client,
        store,
        controls.authorization,
      ).health(guild.id);
      const healthy =
        client.isReady() &&
        protection.auditReady &&
        protection.unavailable.length === 0;
      const tone =
        last?.event.severity === "critical" &&
        ["failed", "degraded"].includes(last.status)
          ? "error"
          : config.mode === "monitor"
            ? "warning"
            : healthy
              ? "success"
              : "warning";
      let restartState: string;
      try {
        restartState = controls.restart?.get(guild.id)?.state ?? "IDLE";
      } catch (error) {
        restartState = "MANUAL_RECOVERY_REQUIRED";
        logger.warn(
          { err: error, guildId: guild.id },
          "Restart journal unavailable for panel",
        );
      }
      const description =
        t(language, "persistent.overview", {
          server: guild.name ?? guild.id,
          mode: t(language, `mode.${config.mode}`),
          active: protection.active,
          total: protection.eligible,
          unavailable: protection.unavailable.length,
          members: new Set(
            entries
              .filter((entry) => entry.kind !== "role")
              .map((entry) => entry.subjectId),
          ).size,
          roles: new Set(
            entries
              .filter((entry) => entry.kind === "role")
              .map((entry) => entry.subjectId),
          ).size,
          recent: hostile.filter(
            (incident) => incident.createdAt >= Date.now() - 86400000,
          ).length,
          backup: t(
            language,
            protection.snapshotReady ? "common.yes" : "common.no",
          ),
          voice: t(
            language,
            `control.voice.state.${controls.voice.getState(guild.id).status}`,
          ),
          health: t(language, healthy ? "panel.healthy" : "panel.degraded"),
          last: last
            ? `${moduleName(language, last.event.action)} · <t:${Math.floor(last.createdAt / 1000)}:R>`
            : t(language, "common.none"),
        }) +
        "\n\n" +
        t(language, "activity.recentTitle") +
        "\n" +
        recentActivityText(language, incidents) +
        (controls.restart
          ? "\n\n" +
            t(language, "restart.overview", {
              state: t(language, "restart.state." + restartState),
            })
          : "");
      json.embeds = [
        createEmbed(language, {
          title: t(language, "persistent.title"),
          description,
          tone,
        }).toJSON() as unknown as Record<string, unknown>,
      ];
      json.components?.push(
        new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(permanentId("panel-tools"))
              .setLabel(t(language, "persistent.tools"))
              .setStyle(ButtonStyle.Secondary),
          )
          .toJSON() as unknown as JsonComponent,
      );
    } else if (view.section === "settings") {
      const navigation = json.components?.[1];
      if (navigation?.components && navigation.components.length < 5)
        navigation.components.push(
          new ButtonBuilder()
            .setCustomId(permanentId("panel-tools"))
            .setLabel(t(language, "persistent.tools"))
            .setStyle(ButtonStyle.Secondary)
            .toJSON() as unknown as JsonComponent,
        );
    }
    return { payload: json, view };
  }
  async function renderFor(
    guildId: string,
    actorId: string,
    view?: PermanentPanelRecord["view"],
  ): Promise<{ payload: JsonPanel; view: PermanentPanelRecord["view"] }> {
    const guild = await client.guilds.fetch({ guild: guildId, force: true });
    if (view?.view === "permanent-tools")
      return {
        payload: JSON.parse(JSON.stringify(tools(guildId))) as JsonPanel,
        view,
      };
    return publicPayload(
      guild,
      await render(
        guild,
        actorId,
        view && isSection(view.section) ? view.section : "overview",
        view?.page ?? 0,
        view?.moduleId,
        view,
      ),
      actorId,
    );
  }
  async function update(
    guildId: string,
    record: PermanentPanelRecord,
    rendered: { payload: JsonPanel; view: PermanentPanelRecord["view"] },
    force = false,
  ): Promise<void> {
    const message = await registered(guildId, record),
      fingerprint = JSON.stringify(rendered.payload);
    if (force || fingerprints.get(guildId) !== fingerprint)
      await message.edit(rendered.payload as Parameters<Message["edit"]>[0]);
    fingerprints.set(guildId, fingerprint);
    const next = {
      ...record,
      status: "ready" as const,
      panelLanguage: languageFor(store, guildId),
      view: rendered.view,
    };
    if (JSON.stringify(next) !== JSON.stringify(record)) save(guildId, next);
  }
  async function refresh(guildId: string, home = false): Promise<void> {
    if (!ownerId) return;
    return run(guildId, async () => {
      const record = get(guildId);
      if (!record?.panelEnabled || (!home && record.status === "unavailable"))
        return;
      try {
        await update(
          guildId,
          record,
          await renderFor(guildId, ownerId!, home ? undefined : record.view),
          home,
        );
      } catch (error) {
        if (missing(error) || error instanceof UserError) {
          save(guildId, { ...record, status: "unavailable" });
        }
        throw error;
      }
    });
  }
  function notify(guildId: string): void {
    if (disposed || timers.has(guildId)) return;
    const timer = setTimeout(() => {
      timers.delete(guildId);
      void refresh(guildId).catch((error) =>
        logger.warn(
          { err: error, guildId },
          "Permanent panel refresh failed; security continues",
        ),
      );
    }, 1500);
    timer.unref?.();
    timers.set(guildId, timer);
  }
  async function createMessage(
    actorId: string,
    guildId: string,
    channelId: string,
    old?: PermanentPanelRecord,
  ): Promise<PermanentPanelRecord> {
    const destination = await channel(guildId, channelId),
      rendered = await renderFor(guildId, actorId);
    if (store.get(guildId, "panel_creation", "main"))
      throw new UserError("persistent.uncertainCreate");
    const nonce = randomBytes(12).toString("hex");
    store.put(guildId, "panel_creation", "main", {
      version: 1,
      state: "pending",
      channelId,
      nonce,
      startedAt: Date.now(),
    });
    assert(actorId);
    let message: Message;
    try {
      message = await destination.send({
        ...rendered.payload,
        nonce,
        enforceNonce: true,
      } as Parameters<TextChannel["send"]>[0]);
    } catch (error) {
      if ([50001, 50013, 50035].includes(errorCode(error) ?? 0))
        store.delete(guildId, "panel_creation", "main");
      throw error;
    }
    if (
      message.author.id !== client.user?.id ||
      message.channelId !== channelId ||
      message.guildId !== guildId
    )
      throw new UserError("persistent.wrongAuthor");
    const record: PermanentPanelRecord = {
      version: 1,
      panelChannelId: channelId,
      panelMessageId: message.id,
      panelCreatedAt: Date.now(),
      panelEnabled: true,
      panelLanguage: languageFor(store, guildId),
      status: "ready",
      ...(old?.recoveryBehavior
        ? { recoveryBehavior: old.recoveryBehavior }
        : {}),
      view: rendered.view,
    };
    save(guildId, record);
    store.delete(guildId, "panel_creation", "main");
    fingerprints.set(guildId, JSON.stringify(rendered.payload));
    if (old)
      try {
        const previous = await registered(guildId, old);
        await previous.edit({
          content: url(guildId, record),
          embeds: [],
          components: [],
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        logger.warn(
          { err: error, guildId },
          "Previous panel could not be retired; its routes are no longer registered",
        );
      }
    return record;
  }
  return {
    get,
    url,
    sessionIn,
    annotatePrivate,
    async privateView(actorId: string, guildId: string) {
      assert(actorId);
      const record = get(guildId);
      if (!record) throw new UserError("persistent.notRegistered");
      const guild = await client.guilds.fetch({ guild: guildId, force: true });
      return render(
        guild,
        actorId,
        record.view && isSection(record.view.section)
          ? record.view.section
          : "overview",
        record.view?.page ?? 0,
        record.view?.moduleId,
        record.view,
      );
    },
    async ensure(actorId: string, guildId: string, channelId: string) {
      assert(actorId);
      return run(guildId, async () => {
        const old = get(guildId);
        if (old) {
          try {
            await registered(guildId, old);
            if (!old.panelEnabled)
              save(guildId, { ...old, panelEnabled: true });
            await update(
              guildId,
              { ...old, panelEnabled: true },
              await renderFor(guildId, actorId),
              true,
            );
            return get(guildId)!;
          } catch (error) {
            if (!missing(error)) throw error;
            save(guildId, { ...old, status: "unavailable" });
          }
        }
        return createMessage(actorId, guildId, channelId);
      });
    },
    async validate(
      actorId: string,
      guildId: string,
      channelId: string,
      messageId: string,
    ) {
      assert(actorId);
      const record = get(guildId);
      if (
        !record?.panelEnabled ||
        record.panelChannelId !== channelId ||
        record.panelMessageId !== messageId
      )
        throw new UserError("persistent.notRegistered");
      await registered(guildId, record);
      return record;
    },
    async publish(
      actorId: string,
      guildId: string,
      payload: InteractionEditReplyOptions,
      revision?: number,
    ) {
      assert(actorId);
      return run(guildId, async () => {
        if (revision !== undefined && revisions.get(guildId) !== revision)
          return;
        const record = get(guildId);
        if (!record?.panelEnabled)
          throw new UserError("persistent.notRegistered");
        const guild = await client.guilds.fetch({
          guild: guildId,
          force: true,
        });
        const rendered = await publicPayload(guild, payload, actorId);
        if (revision !== undefined && revisions.get(guildId) !== revision)
          return;
        await update(guildId, record, rendered);
      });
    },
    async openTools(actorId: string, guildId: string) {
      assert(actorId);
      return run(guildId, async () => {
        const record = get(guildId);
        if (!record) throw new UserError("persistent.notRegistered");
        await update(
          guildId,
          record,
          await renderFor(guildId, actorId, {
            section: "settings",
            view: "permanent-tools",
          }),
        );
      });
    },
    async home(actorId: string, guildId: string, revision?: number) {
      assert(actorId);
      if (revision !== undefined && revisions.get(guildId) !== revision) return;
      await refresh(guildId, true);
    },
    async move(
      actorId: string,
      guildId: string,
      channelId: string,
      expectedMessageId: string,
    ) {
      assert(actorId);
      return run(guildId, async () => {
        const old = get(guildId);
        if (!old || old.panelMessageId !== expectedMessageId)
          throw new UserError("control.stale");
        if (old.panelChannelId === channelId) return old;
        await registered(guildId, old);
        return createMessage(actorId, guildId, channelId, old);
      });
    },
    async pin(actorId: string, guildId: string) {
      assert(actorId);
      return run(guildId, async () => {
        const record = get(guildId);
        if (!record) throw new UserError("persistent.notRegistered");
        const message = await registered(guildId, record);
        if (message.pinned) return;
        const destination = await channel(guildId, record.panelChannelId),
          me = await destination.guild.members.fetchMe({ force: true }),
          permissions = destination.permissionsFor(me);
        if (
          !permissions?.has(PermissionFlagsBits.ManageMessages) &&
          !permissions?.has(PermissionFlagsBits.PinMessages)
        )
          throw new UserError("persistent.pinPermissions");
        assert(actorId);
        try {
          await message.pin("Ultimate Guard permanent control panel");
        } catch (error) {
          if ([50001, 50013].includes(errorCode(error) ?? 0))
            throw new UserError("persistent.pinPermissions", {}, error);
          throw error;
        }
      });
    },
    async refreshAll() {
      await Promise.allSettled(
        [...client.guilds.cache.keys()].map((guildId) => refresh(guildId)),
      );
    },
    issueRevision(guildId: string) {
      const revision = (revisions.get(guildId) ?? 0) + 1;
      revisions.set(guildId, revision);
      return revision;
    },
    notify,
    start(): Promise<void> {
      if (disposed) return Promise.resolve();
      if (startupTask) return startupTask;
      startupTask = (async () => {
        if (!unsubscribe)
          unsubscribe = subscribeChanges(store, (change) => {
            if (
              [
                "config",
                "whitelist",
                "backups",
                "recovery_jobs",
                "incidents",
                "containment_records",
                "rollback_attempts",
                "runtime",
                "voice_state",
                "restart_sessions",
                "restart_active",
                "restart_operations",
                "restart_lockdown",
              ].includes(change.collection)
            ) {
              if (change.guildId === "$global") {
                for (const guild of client.guilds.cache.values())
                  notify(guild.id);
              } else notify(change.guildId);
            }
          });
        if (!ownerId) return;
        for (const guild of client.guilds.cache.values())
          try {
            if (get(guild.id)?.panelEnabled) await refresh(guild.id, true);
          } catch (error) {
            // A definite deleted message is the only automatic replacement trigger.
            // Wrong authors, missing permissions and uncertain responses never create.
            let record: PermanentPanelRecord | undefined;
            try {
              record = get(guild.id);
            } catch {
              // Corrupt references stay untouched and must not prevent other guilds restoring.
            }
            if (
              errorCode(error) === 10008 &&
              record?.recoveryBehavior === "replace"
            ) {
              const recoveryRecord = record;
              try {
                await run(guild.id, () =>
                  createMessage(
                    ownerId!,
                    guild.id,
                    recoveryRecord.panelChannelId,
                    recoveryRecord,
                  ),
                );
                continue;
              } catch (recoveryError) {
                logger.warn(
                  { err: recoveryError, guildId: guild.id },
                  "Permanent panel replacement failed; owner reconciliation is required",
                );
                continue;
              }
            }
            logger.warn(
              { err: error, guildId: guild.id },
              "Permanent panel unavailable after startup; owner recreation is required",
            );
          }
      })();
      return startupTask;
    },
    async dispose() {
      disposed = true;
      unsubscribe?.();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      await Promise.allSettled([...queues.values()]);
    },
  };
}
export type PermanentPanel = ReturnType<typeof createPermanentPanel>;
