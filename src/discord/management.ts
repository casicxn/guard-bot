import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type Guild,
  type Interaction,
  type InteractionEditReplyOptions,
} from "discord.js";
import type { Logger } from "pino";
import type {
  BackupService,
  Enforcement,
  GuildConfig,
  Mode,
  Store,
  WhitelistEntry,
} from "../contracts.js";
import type {
  ManagementActor,
  ManagementControls,
} from "../control/contracts.js";
import { ownerGuildStore, ownerBackupService } from "../control/access.js";
import { createProtectionControl } from "../control/protection.js";
import { defaultModules, MODULES } from "../security/index.js";
import {
  t,
  languageFor,
  moduleName,
  actionName,
  type Language,
} from "../locales/index.js";
import { createEmbed } from "./embeds.js";
import { UserError, userErrorText } from "./errors.js";
import {
  createPanels,
  isSection,
  supportsThreshold,
  subjectMention,
  groups,
  protectionHealthText,
  type Section,
} from "./panels.js";
import { Sessions, type Session, type PendingAction } from "./sessions.js";
import { addWhitelist, removeWhitelist } from "./whitelist.js";
import { setLockdown } from "./adapter.js";
import { operationText, previewText, restorationTone } from "./presentation.js";
export function validateLimits(
  countText: string,
  secondsText: string,
): {
  threshold: number;
  windowMs: number;
} {
  const count = Number(countText),
    seconds = Number(secondsText);
  if (
    !/^\d+$/.test(countText.trim()) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 10000
  )
    throw new UserError("panel.limitCountError");
  if (
    !/^\d+$/.test(secondsText.trim()) ||
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > 86400
  )
    throw new UserError("panel.limitSecondsError");
  return { threshold: count, windowMs: seconds * 1000 };
}
function input(
  id: string,
  label: string,
  value: string,
  maxLength: number,
  required = true,
) {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(required)
      .setMaxLength(maxLength)
      .setValue(value),
  );
}
const highImpact = (action: string) =>
  ["strip", "kick", "ban", "lockdown", "reverse"].includes(action);
export function createManagement(
  client: Client,
  rawStore: Store,
  rawBackup: BackupService,
  logger: Logger,
  sessions: Sessions,
  controls: ManagementControls,
): (interaction: Interaction) => Promise<void> {
  const protection = createProtectionControl(
    client,
    rawStore,
    controls.authorization,
  );
  const panel = createPanels(
    client,
    rawStore,
    rawBackup,
    sessions,
    logger,
    controls,
  );
  const actor = (userId: string): ManagementActor => ({
    userId,
    authorization: controls.authorization,
  });
  const bound = (userId: string, guildId: string) =>
    ownerGuildStore(rawStore, controls.authorization, userId, guildId);
  const backups = (userId: string, guildId: string) =>
    ownerBackupService(rawBackup, controls.authorization, userId, guildId);
  function navigation(
    userId: string,
    guildId: string,
    language: Language,
    section = "overview",
  ) {
    const token = sessions.create(userId, guildId, { section, view: "result" });
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`guard:back:${token}`)
        .setLabel(t(language, "common.back"))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`guard:main:${token}`)
        .setLabel(t(language, "control.main"))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`guard:refresh:${token}`)
        .setLabel(t(language, "control.refresh"))
        .setStyle(ButtonStyle.Secondary),
    );
  }
  function message(
    guildId: string,
    userId: string,
    title: string,
    description: string,
    tone: "success" | "warning" | "error" | "info" = "success",
    section = "overview",
  ): InteractionEditReplyOptions {
    const language = languageFor(bound(userId, guildId), guildId);
    return {
      content: "",
      embeds: [
        createEmbed(language, {
          title,
          description: description.slice(0, 3900),
          tone,
        }),
      ],
      components: [navigation(userId, guildId, language, section)],
      allowedMentions: { parse: [] },
    };
  }
  function confirmation(
    guildId: string,
    userId: string,
    pending: PendingAction,
    description: string,
  ): InteractionEditReplyOptions {
    const language = languageFor(bound(userId, guildId), guildId),
      token = sessions.create(userId, guildId, {
        pending,
        section: pending.kind === "config" ? pending.section : "overview",
      });
    return {
      content: "",
      embeds: [
        createEmbed(language, {
          title: t(
            language,
            pending.kind === "protection"
              ? "nuke.confirmTitle"
              : "control.confirmTitle",
          ),
          description,
          tone: "warning",
        }),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`guard:confirm:${token}`)
            .setLabel(
              t(
                language,
                pending.kind === "protection"
                  ? "nuke.confirmEnable"
                  : "common.confirm",
              ),
            )
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`guard:cancel:${token}`)
            .setLabel(t(language, "common.cancel"))
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`guard:main:${token}`)
            .setLabel(t(language, "control.main"))
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      allowedMentions: { parse: [] },
    };
  }
  function whitelistRecords(store: Store, guildId: string, subject: string) {
    return JSON.stringify(
      store
        .list<WhitelistEntry>(guildId, "whitelist")
        .filter((entry) => entry.subjectId === subject),
    );
  }
  async function trust(
    guild: Guild,
    userId: string,
    subject: string,
    confirmUpgrade = false,
  ): Promise<InteractionEditReplyOptions> {
    const store = bound(userId, guild.id),
      language = languageFor(store, guild.id);
    try {
      const result = await addWhitelist(store, guild, subject, actor(userId), {
        confirmUpgrade,
      });
      const payload = message(
        guild.id,
        userId,
        t(
          language,
          result.duplicate
            ? "whitelist.duplicate"
            : result.upgraded
              ? "whitelist.upgraded"
              : "whitelist.success",
        ),
        t(language, "control.whitelistIntro"),
        result.duplicate ? "info" : "success",
        "whitelist",
      );
      const embed = createEmbed(language, {
        title: t(
          language,
          result.duplicate
            ? "whitelist.duplicate"
            : result.upgraded
              ? "whitelist.upgraded"
              : "whitelist.success",
        ),
        description: t(language, "control.whitelistIntro"),
        tone: result.duplicate ? "info" : "success",
      }).addFields(
        {
          name: t(language, "whitelist.subject"),
          value: subjectMention(result.entry),
        },
        {
          name: t(language, "whitelist.type"),
          value: t(language, `type.${result.entry.kind}`),
          inline: true,
        },
        {
          name: t(language, "whitelist.access"),
          value: t(language, "whitelist.allModules"),
          inline: true,
        },
        {
          name: t(language, "whitelist.status"),
          value: t(language, "whitelist.active"),
          inline: true,
        },
      );
      return { ...payload, embeds: [embed] };
    } catch (error) {
      if (
        error instanceof UserError &&
        error.key === "whitelist.upgradeRequired"
      )
        return confirmation(
          guild.id,
          userId,
          {
            kind: "whitelistUpgrade",
            subject,
            expected: whitelistRecords(store, guild.id, subject),
          },
          t(language, "control.upgradeConfirm", { subject: `<@${subject}>` }),
        );
      throw error;
    }
  }
  function selected(store: Store, guildId: string, session: Session) {
    const id = session.moduleId,
      policy = id ? store.getConfig(guildId).modules[id] : undefined;
    if (!id || !policy || !MODULES.some((module) => module.id === id))
      throw new UserError("panel.invalidModule");
    return { id, policy };
  }
  async function preview(
    guild: Guild,
    userId: string,
    id: string,
    scope = "all",
  ): Promise<InteractionEditReplyOptions> {
    const service = backups(userId, guild.id),
      language = languageFor(bound(userId, guild.id), guild.id);
    if (!["all", "roles", "channels", "guild"].includes(scope))
      throw new UserError("panel.invalidChoice");
    if (!service.list(guild.id).some((item) => item.id === id))
      throw new UserError("panel.backupMissing");
    return confirmation(
      guild.id,
      userId,
      { kind: "backupRestore", id, scope },
      previewText(language, await service.preview(guild.id, id, scope)),
    );
  }
  async function setLogChannel(guild: Guild, store: Store, id: string) {
    const channel = await guild.channels.fetch(id);
    if (
      !channel ||
      !("guild" in channel) ||
      channel.guild.id !== guild.id ||
      !channel.isTextBased()
    )
      throw new UserError("panel.invalidChoice");
    const config = store.getConfig(guild.id);
    config.logChannelId = channel.id;
    store.setConfig(guild.id, config);
  }
  return async function handle(interaction: Interaction): Promise<void> {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isMessageComponent() &&
      !interaction.isModalSubmit()
    )
      return;
    if (
      interaction.isChatInputCommand()
        ? interaction.commandName !== "guard"
        : !interaction.customId.startsWith("guard:")
    )
      return;
    // Central instance ownership precedes panel acknowledgement and every state-changing route.
    if (!(await controls.authorization.requireBotOwner(interaction))) return;
    let language: Language = "tr";
    if (!interaction.guildId) {
      await interaction.reply({
        embeds: [
          createEmbed(language, {
            title: t(language, "panel.error"),
            description: t(language, "error.guildOnly"),
            tone: "error",
          }),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }
    try {
      const guildId = interaction.guildId,
        userId = interaction.user.id,
        store = bound(userId, guildId),
        service = backups(userId, guildId);
      language = languageFor(store, guildId);
      let operation = "",
        token = "",
        session: Session | undefined;
      const requestGlobalMode = async (mode: Mode) => {
        controls.authorization.assertOwner(userId);
        const expected = JSON.stringify(store.getConfig(guildId));
        if (mode === "monitor") {
          await protection.setMode(userId, guildId, "monitor", expected);
          await show("overview");
          return;
        }
        const health = await protection.health(guildId);
        await interaction.editReply(
          confirmation(
            guildId,
            userId,
            { kind: "protection", mode: "protect", expected },
            t(language, "nuke.confirmDescription") +
              "\n\n" +
              protectionHealthText(language, health),
          ),
        );
      };
      if (!interaction.isChatInputCommand()) {
        const route = /^guard:([a-z-]+):([a-f0-9]{24})$/.exec(
          interaction.customId,
        );
        if (!route) throw new UserError("error.invalidRoute");
        operation = route[1]!;
        token = route[2]!;
        session = sessions.get(token, userId, guildId);
      }
      const modalOperation =
        (interaction.isButton() &&
          ["settings", "limit-edit", "voice-id"].includes(operation)) ||
        (interaction.isStringSelectMenu() &&
          operation === "voice-action" &&
          interaction.values[0] === "id");
      let guild: Guild;
      if (modalOperation) {
        const cached = client.guilds.cache.get(guildId);
        if (!cached) throw new UserError("panel.guildUnavailable");
        guild = cached;
      } else {
        if (interaction.isMessageComponent()) await interaction.deferUpdate();
        else if (interaction.isModalSubmit() && interaction.isFromMessage())
          await interaction.deferUpdate();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        guild = await client.guilds.fetch(guildId);
      }
      controls.authorization.assertOwner(userId);
      const show = async (
        section: Section = "overview",
        page = 0,
        moduleId?: string,
        extra: Partial<Session> = {},
      ) => {
        await interaction.editReply(
          await panel(guild, userId, section, page, moduleId, extra),
        );
      };
      const configChange = async (
        next: GuildConfig,
        summary: string,
        section: Section = "modules",
        moduleId?: string,
        requiresConfirmation = false,
      ) => {
        const current = store.getConfig(guildId);
        if (requiresConfirmation) {
          await interaction.editReply(
            confirmation(
              guildId,
              userId,
              {
                kind: "config",
                expected: JSON.stringify(current),
                next,
                section,
                moduleId,
              },
              t(language, "control.confirmConfig", { summary }),
            ),
          );
        } else {
          store.setConfig(guildId, next);
          await show(section, session?.page ?? 0, moduleId, {
            group: session?.group,
          });
        }
      };
      if (!interaction.isChatInputCommand()) {
        if (!session) throw new UserError("error.sessionExpired");
        if (
          modalOperation &&
          (interaction.isButton() || interaction.isStringSelectMenu())
        ) {
          if (operation === "settings") {
            const config = store.getConfig(guildId);
            await interaction.showModal(
              new ModalBuilder()
                .setCustomId(`guard:save-settings:${token}`)
                .setTitle(t(language, "panel.retentionTitle"))
                .addComponents(
                  input(
                    "days",
                    t(language, "panel.retentionDays"),
                    String(config.incidentRetentionDays),
                    4,
                  ),
                  input(
                    "count",
                    t(language, "panel.retentionCount"),
                    String(config.backupRetention),
                    3,
                  ),
                  input(
                    "hours",
                    t(language, "panel.retentionHours"),
                    String(config.backupIntervalHours),
                    4,
                  ),
                ),
            );
            return;
          }
          if (operation === "limit-edit") {
            const { id, policy } = selected(store, guildId, session);
            if (
              store.getConfig(guildId).mode === "protect" &&
              store.getConfig(guildId).zeroTolerance &&
              Boolean(
                MODULES.find((module) => module.id === id)?.administrative,
              )
            )
              throw new UserError("nuke.profileManaged");
            if (!supportsThreshold(id))
              throw new UserError("panel.noThreshold");
            await interaction.showModal(
              new ModalBuilder()
                .setCustomId(`guard:save-limits:${token}`)
                .setTitle(t(language, "panel.limitTitle"))
                .addComponents(
                  input(
                    "count",
                    t(language, "panel.limitCount"),
                    String(policy.threshold),
                    5,
                  ),
                  input(
                    "seconds",
                    t(language, "panel.limitSeconds"),
                    String(policy.windowMs / 1000),
                    5,
                  ),
                ),
            );
            return;
          }
          await interaction.showModal(
            new ModalBuilder()
              .setCustomId(`guard:save-voice-id:${token}`)
              .setTitle(t(language, "control.voiceIdTitle"))
              .addComponents(
                input(
                  "channel",
                  t(language, "control.voiceIdField"),
                  controls.voice.getConfig(guildId).channelId ?? "",
                  22,
                ),
              ),
          );
          return;
        }
        if (interaction.isModalSubmit()) {
          if (operation === "save-limits") {
            const { id } = selected(store, guildId, session);
            if (
              store.getConfig(guildId).mode === "protect" &&
              store.getConfig(guildId).zeroTolerance &&
              Boolean(
                MODULES.find((module) => module.id === id)?.administrative,
              )
            )
              throw new UserError("nuke.profileManaged");
            if (!supportsThreshold(id))
              throw new UserError("panel.noThreshold");
            const values = validateLimits(
                interaction.fields.getTextInputValue("count"),
                interaction.fields.getTextInputValue("seconds"),
              ),
              next = store.getConfig(guildId);
            Object.assign(next.modules[id]!, values);
            sessions.consume(token);
            store.setConfig(guildId, next);
            await show(
              session.section === "limits" ? "limits" : "modules",
              session.page,
              id,
              { group: session.group },
            );
            return;
          }
          if (operation === "save-settings") {
            const values = ["days", "count", "hours"].map((id) =>
              interaction.fields.getTextInputValue(id).trim(),
            );
            if (values.some((value) => !/^\d+$/.test(value)))
              throw new UserError("panel.retentionError");
            const [days, count, hours] = values.map(Number);
            if (
              !Number.isInteger(days) ||
              days! < 1 ||
              days! > 3650 ||
              !Number.isInteger(count) ||
              count! < 1 ||
              count! > 100 ||
              !Number.isInteger(hours) ||
              hours! < 0 ||
              hours! > 8760
            )
              throw new UserError("panel.retentionError");
            const next = store.getConfig(guildId);
            next.incidentRetentionDays = days!;
            next.backupRetention = count!;
            next.backupIntervalHours = hours!;
            sessions.consume(token);
            store.setConfig(guildId, next);
            await show("settings");
            return;
          }
          if (operation === "save-voice-id") {
            sessions.consume(token);
            await controls.voice.configure(userId, guildId, {
              channelId: interaction.fields.getTextInputValue("channel").trim(),
            });
            await show("voice");
            return;
          }
          throw new UserError("error.invalidRoute");
        }
        if (operation === "confirm" && interaction.isButton()) {
          const pending = session.pending;
          if (!pending) throw new UserError("error.invalidRoute");
          sessions.consume(token);
          if (pending.kind === "restart") {
            if (!controls.restart) throw new UserError("restart.unavailable");
            if (pending.action === "activate")
              await controls.restart.activate(
                userId,
                guildId,
                pending.sessionId,
              );
            else
              await controls.restart.restore(
                userId,
                guildId,
                pending.sessionId,
              );
            await show("restart");
            return;
          }
          if (pending.kind === "protection") {
            await protection.setMode(
              userId,
              guildId,
              pending.mode,
              pending.expected,
            );
            await show("overview");
            return;
          }
          if (pending.kind === "config") {
            if (JSON.stringify(store.getConfig(guildId)) !== pending.expected)
              throw new UserError("control.stale");
            store.setConfig(guildId, pending.next);
            await show(
              isSection(pending.section ?? "")
                ? (pending.section as Section)
                : "modules",
              0,
              pending.moduleId,
            );
            return;
          }
          if (pending.kind === "lockdown") {
            if (JSON.stringify(store.getConfig(guildId)) !== pending.expected)
              throw new UserError("control.stale");
            await setLockdown(guild, store, pending.enabled);
            await show("settings", 0, undefined, { view: "mode" });
            return;
          }
          if (pending.kind === "reset") {
            if (JSON.stringify(store.getConfig(guildId)) !== pending.expected)
              throw new UserError("control.stale");
            const old = store.getConfig(guildId);
            store.setConfig(guildId, {
              language: old.language,
              mode: "monitor",
              modules: defaultModules(),
              incidentRetentionDays: 30,
              backupRetention: 10,
              backupIntervalHours: 0,
              lockdown: old.lockdown,
              notificationsEnabled: true,
            });
            await show("settings");
            return;
          }
          if (pending.kind === "whitelistRemove") {
            if (
              whitelistRecords(store, guildId, pending.subject) !==
              pending.expected
            )
              throw new UserError("control.stale");
            const result = removeWhitelist(
              store,
              guildId,
              pending.subject,
              actor(userId),
            );
            await interaction.editReply(
              message(
                guildId,
                userId,
                t(language, "whitelist.removed"),
                t(language, "whitelist.removedDescription", {
                  count: result.removed,
                }),
                "success",
                "whitelist",
              ),
            );
            return;
          }
          if (pending.kind === "whitelistUpgrade") {
            if (
              whitelistRecords(store, guildId, pending.subject) !==
              pending.expected
            )
              throw new UserError("control.stale");
            await interaction.editReply(
              await trust(guild, userId, pending.subject, true),
            );
            return;
          }
          if (pending.kind === "backupRestore") {
            const result = await service.restore(
              guildId,
              pending.id,
              pending.scope,
            );
            await interaction.editReply(
              message(
                guildId,
                userId,
                t(language, "panel.restoreDone"),
                operationText(language, result),
                restorationTone(result),
                "backups",
              ),
            );
            return;
          }
          if (pending.kind === "backupDelete") {
            if (
              JSON.stringify(store.get(guildId, "backups", pending.id)) !==
              pending.expected
            )
              throw new UserError("control.stale");
            store.delete(guildId, "backups", pending.id);
            await interaction.editReply(
              message(
                guildId,
                userId,
                t(language, "panel.success"),
                t(language, "control.backupDeleted"),
                "success",
                "backups",
              ),
            );
            return;
          }
        }
        if (operation === "cancel" && interaction.isButton()) {
          sessions.consume(token);
          await interaction.editReply(
            message(
              guildId,
              userId,
              t(language, "panel.success"),
              t(language, "control.cancelled"),
              "info",
            ),
          );
          return;
        }
        if (operation.startsWith("restart-")) {
          const restart = controls.restart;
          if (!restart) throw new UserError("restart.unavailable");
          if (operation === "restart-prepare" && interaction.isButton()) {
            await restart.prepare(userId, guildId);
            await show("restart");
            return;
          }
          const current = restart.get(guildId);
          if (!current) throw new UserError("restart.noSession");
          if (
            operation === "restart-detail" &&
            interaction.isStringSelectMenu()
          ) {
            const detail = interaction.values[0];
            if (!detail || !["snapshot", "roles", "report"].includes(detail))
              throw new UserError("panel.invalidChoice");
            await show("restart", 0, undefined, { view: detail });
            return;
          }
          if (operation === "restart-cancel" && interaction.isButton()) {
            await restart.cancel(userId, guildId, current.id);
            await show("restart");
            return;
          }
          if (
            ["restart-activate", "restart-restore"].includes(operation) &&
            interaction.isButton()
          ) {
            await interaction.editReply(
              confirmation(
                guildId,
                userId,
                {
                  kind: "restart",
                  action:
                    operation === "restart-activate" ? "activate" : "restore",
                  sessionId: current.id,
                },
                t(
                  language,
                  operation === "restart-activate"
                    ? "restart.confirmActivate"
                    : "restart.confirmRestore",
                ),
              ),
            );
            return;
          }
          throw new UserError("error.invalidRoute");
        }
        if (operation === "global-protection" && interaction.isButton()) {
          sessions.consume(token);
          await requestGlobalMode(
            store.getConfig(guildId).mode === "protect" ? "monitor" : "protect",
          );
          return;
        }
        if (operation === "main") {
          await show();
          return;
        }
        if (operation === "back") {
          await show(
            session.section &&
              isSection(session.section) &&
              !session.view &&
              !session.backupId &&
              !session.jobId
              ? "overview"
              : isSection(session.section ?? "")
                ? (session.section as Section)
                : "overview",
            0,
            session.moduleId,
            { group: session.group },
          );
          return;
        }
        if (operation === "refresh") {
          await show(
            isSection(session.section ?? "")
              ? (session.section as Section)
              : "overview",
            session.page,
            session.moduleId,
            session,
          );
          return;
        }
        if (operation === "section" && interaction.isStringSelectMenu()) {
          const section = interaction.values[0];
          if (!section || !isSection(section))
            throw new UserError("error.invalidRoute");
          await show(section);
          return;
        }
        if (
          (operation === "prev" || operation === "next") &&
          interaction.isButton()
        ) {
          const section = session.section;
          if (!section || !isSection(section))
            throw new UserError("error.invalidRoute");
          await show(
            section,
            Math.max(0, (session.page ?? 0) + (operation === "next" ? 1 : -1)),
            undefined,
            session,
          );
          return;
        }
        if (operation === "group" && interaction.isStringSelectMenu()) {
          const group = interaction.values[0];
          if (!group || !groups.includes(group as (typeof groups)[number]))
            throw new UserError("panel.invalidChoice");
          await show(
            session.section === "limits" ? "limits" : "modules",
            0,
            undefined,
            { group },
          );
          return;
        }
        if (operation === "module" && interaction.isStringSelectMenu()) {
          const id = interaction.values[0];
          if (!id || !MODULES.some((item) => item.id === id))
            throw new UserError("panel.invalidModule");
          await show(
            session.section === "limits" ? "limits" : "modules",
            session.page,
            id,
            { group: session.group },
          );
          return;
        }
        if (
          ["mode-view", "response-view", "recovery-view"].includes(operation) &&
          interaction.isButton()
        ) {
          selected(store, guildId, session);
          await show("modules", session.page, session.moduleId, {
            group: session.group,
            view:
              operation === "mode-view"
                ? "mode"
                : operation === "response-view"
                  ? "response"
                  : "recovery",
          });
          return;
        }
        if (operation === "open-backups" || operation === "backup-jobs") {
          await show(
            "backups",
            0,
            undefined,
            operation === "backup-jobs" ? { view: "jobs" } : {},
          );
          return;
        }
        if (["toggle", "module-mode", "module-action"].includes(operation)) {
          const { id, policy } = selected(store, guildId, session),
            next = store.getConfig(guildId),
            updated = next.modules[id]!;
          if (
            next.mode === "protect" &&
            next.zeroTolerance &&
            Boolean(MODULES.find((module) => module.id === id)?.administrative)
          )
            throw new UserError("nuke.profileManaged");
          let risky = false;
          if (operation === "toggle" && interaction.isButton()) {
            updated.enabled = !policy.enabled;
            risky =
              updated.enabled &&
              updated.mode === "protect" &&
              highImpact(updated.action);
          } else if (
            interaction.isStringSelectMenu() &&
            Boolean(MODULES.find((module) => module.id === id)?.administrative)
          ) {
            const value = interaction.values[0];
            if (
              operation === "module-mode" &&
              (value === "monitor" || value === "protect")
            ) {
              updated.mode = value as Mode;
              risky = value === "protect";
            } else if (
              operation === "module-action" &&
              value &&
              [
                "log",
                "warn",
                "strip",
                "kick",
                "ban",
                "lockdown",
                "reverse",
              ].includes(value)
            ) {
              updated.action = value as Enforcement;
              risky = highImpact(value);
            } else throw new UserError("panel.invalidChoice");
          } else throw new UserError("panel.invalidChoice");
          sessions.consume(token);
          await configChange(
            next,
            `${moduleName(language, id)}\n${stateSummary(language, updated.enabled, updated.mode, updated.action)}`,
            "modules",
            id,
            risky,
          );
          return;
        }
        if (
          (operation === "trust-user" && interaction.isUserSelectMenu()) ||
          (operation === "trust-role" && interaction.isRoleSelectMenu())
        ) {
          const subject = interaction.values[0];
          if (!subject) throw new UserError("whitelist.invalidId");
          sessions.consume(token);
          await interaction.editReply(await trust(guild, userId, subject));
          return;
        }
        if (
          operation === "whitelist-remove" &&
          interaction.isStringSelectMenu()
        ) {
          const subject = interaction.values[0];
          if (
            !subject ||
            !store
              .list<WhitelistEntry>(guildId, "whitelist")
              .some((entry) => entry.subjectId === subject)
          )
            throw new UserError("error.notFound");
          await interaction.editReply(
            confirmation(
              guildId,
              userId,
              {
                kind: "whitelistRemove",
                subject,
                expected: whitelistRecords(store, guildId, subject),
              },
              t(language, "control.removeConfirm", {
                subject: `<@${subject}>`,
              }),
            ),
          );
          return;
        }
        if (operation === "backup-create" && interaction.isButton()) {
          sessions.consume(token);
          const result = await service.create(guildId);
          await interaction.editReply(
            message(
              guildId,
              userId,
              t(language, "panel.backupCreated"),
              t(language, "panel.backupCreatedBody", { id: result.id }),
              "success",
              "backups",
            ),
          );
          return;
        }
        if (operation === "backup-select" && interaction.isStringSelectMenu()) {
          const id = interaction.values[0];
          if (!id || !service.list(guildId).some((item) => item.id === id))
            throw new UserError("panel.backupMissing");
          await show("backups", 0, undefined, { backupId: id, scope: "all" });
          return;
        }
        if (operation === "backup-scope" && interaction.isStringSelectMenu()) {
          const scope = interaction.values[0];
          if (!scope || !["all", "roles", "channels", "guild"].includes(scope))
            throw new UserError("panel.invalidChoice");
          await show("backups", 0, undefined, {
            backupId: session.backupId,
            scope,
          });
          return;
        }
        if (operation === "backup-preview" && interaction.isButton()) {
          if (!session.backupId) throw new UserError("panel.backupMissing");
          await interaction.editReply(
            await preview(guild, userId, session.backupId, session.scope),
          );
          return;
        }
        if (operation === "backup-delete" && interaction.isButton()) {
          const id = session.backupId,
            snapshot = id ? store.get(guildId, "backups", id) : undefined;
          if (!id || !snapshot) throw new UserError("panel.backupMissing");
          await interaction.editReply(
            confirmation(
              guildId,
              userId,
              { kind: "backupDelete", id, expected: JSON.stringify(snapshot) },
              t(language, "control.backupDeleteConfirm", { id }),
            ),
          );
          return;
        }
        if (operation === "job-select" && interaction.isStringSelectMenu()) {
          const id = interaction.values[0];
          if (!id || !store.get(guildId, "recovery_jobs", id))
            throw new UserError("ops.jobs.notFound");
          await show("backups", 0, undefined, { view: "jobs", jobId: id });
          return;
        }
        if (
          operation === "incident-filter" &&
          interaction.isStringSelectMenu()
        ) {
          const filter = interaction.values[0];
          if (
            !filter ||
            !["all", "critical", "unresolved", "failed"].includes(filter)
          )
            throw new UserError("panel.invalidChoice");
          await show("incidents", 0, undefined, { filter });
          return;
        }
        if (
          operation === "voice-channel" &&
          interaction.isChannelSelectMenu()
        ) {
          const value = interaction.values[0];
          if (!value) throw new UserError("panel.invalidChoice");
          sessions.consume(token);
          await controls.voice.configure(userId, guildId, { channelId: value });
          await show("voice");
          return;
        }
        if (operation === "voice-action" && interaction.isStringSelectMenu()) {
          const value = interaction.values[0],
            config = controls.voice.getConfig(guildId);
          sessions.consume(token);
          if (value === "auto-on" || value === "auto-off")
            await controls.voice.configure(userId, guildId, {
              autoJoin: value === "auto-on",
            });
          else if (value === "connect")
            await controls.voice.connect(userId, guildId);
          else if (value === "disconnect")
            await controls.voice.disconnect(userId, guildId);
          else if (value === "reconnect")
            await controls.voice.reconnect(userId, guildId);
          else if (value === "mute")
            await controls.voice.configure(userId, guildId, {
              selfMute: !config.selfMute,
            });
          else if (value === "deaf")
            await controls.voice.configure(userId, guildId, {
              selfDeaf: !config.selfDeaf,
            });
          else throw new UserError("panel.invalidChoice");
          await show("voice");
          return;
        }
        if (operation === "language" && interaction.isStringSelectMenu()) {
          const value = interaction.values[0];
          if (value !== "tr" && value !== "en")
            throw new UserError("panel.invalidChoice");
          const next = store.getConfig(guildId);
          next.language = value;
          sessions.consume(token);
          store.setConfig(guildId, next);
          await show("settings");
          return;
        }
        if (operation === "log-channel" && interaction.isChannelSelectMenu()) {
          const value = interaction.values[0];
          if (!value) throw new UserError("panel.invalidChoice");
          sessions.consume(token);
          await setLogChannel(guild, store, value);
          await show("settings");
          return;
        }
        if (operation === "settings-mode" && interaction.isButton()) {
          await show("settings", 0, undefined, { view: "mode" });
          return;
        }
        if (operation === "lockdown" && interaction.isButton()) {
          await interaction.editReply(
            confirmation(
              guildId,
              userId,
              {
                kind: "lockdown",
                enabled: !store.getConfig(guildId).lockdown,
                expected: JSON.stringify(store.getConfig(guildId)),
              },
              t(language, "control.lockdownConfirm"),
            ),
          );
          return;
        }
        if (operation === "global-mode" && interaction.isStringSelectMenu()) {
          const value = interaction.values[0];
          if (value !== "monitor" && value !== "protect")
            throw new UserError("panel.invalidChoice");
          sessions.consume(token);
          await requestGlobalMode(value);
          return;
        }
        if (operation === "notifications" && interaction.isButton()) {
          const next = store.getConfig(guildId);
          next.notificationsEnabled = next.notificationsEnabled === false;
          sessions.consume(token);
          store.setConfig(guildId, next);
          await show("settings");
          return;
        }
        if (operation === "reset" && interaction.isButton()) {
          await interaction.editReply(
            confirmation(
              guildId,
              userId,
              {
                kind: "reset",
                expected: JSON.stringify(store.getConfig(guildId)),
              },
              t(language, "control.resetConfirm"),
            ),
          );
          return;
        }
        if (operation === "developer" && interaction.isButton()) {
          await interaction.editReply(
            message(
              guildId,
              userId,
              t(language, "control.developer"),
              t(language, "control.developerBody"),
              "info",
              "settings",
            ),
          );
          return;
        }
        throw new UserError("error.invalidRoute");
      }
      const options = interaction.options,
        group = options.getSubcommandGroup(),
        sub = options.getSubcommand();
      if (group === "whitelist") {
        if (sub === "add") {
          await interaction.editReply(
            await trust(guild, userId, options.getString("subject", true)),
          );
          return;
        }
        if (sub === "remove") {
          const subject = options.getString("subject", true);
          if (
            !store
              .list<WhitelistEntry>(guildId, "whitelist")
              .some((entry) => entry.subjectId === subject)
          )
            throw new UserError("whitelist.notListed");
          await interaction.editReply(
            confirmation(
              guildId,
              userId,
              {
                kind: "whitelistRemove",
                subject,
                expected: whitelistRecords(store, guildId, subject),
              },
              t(language, "control.removeConfirm", {
                subject: `<@${subject}>`,
              }),
            ),
          );
          return;
        }
        if (sub === "list") {
          await show("whitelist");
          return;
        }
      }
      if (group === "backup") {
        if (sub === "create") {
          const result = await service.create(guildId);
          await interaction.editReply(
            message(
              guildId,
              userId,
              t(language, "panel.backupCreated"),
              t(language, "panel.backupCreatedBody", { id: result.id }),
              "success",
              "backups",
            ),
          );
          return;
        }
        if (sub === "list") {
          await show("backups");
          return;
        }
        if (sub === "restore") {
          await interaction.editReply(
            await preview(
              guild,
              userId,
              options.getString("id", true),
              options.getString("scope") ?? "all",
            ),
          );
          return;
        }
        if (sub === "jobs") {
          await show(
            "backups",
            (options.getInteger("page") ?? 1) - 1,
            undefined,
            { view: "jobs", jobId: options.getString("id") ?? undefined },
          );
          return;
        }
      }
      if (!group) {
        if (sub === "limits" || sub === "modules") {
          await show(sub === "limits" ? "limits" : "modules");
          return;
        }
        if (["panel", "status", "health", "incidents", "help"].includes(sub)) {
          await show(
            sub === "health"
              ? "health"
              : sub === "incidents"
                ? "incidents"
                : sub === "help"
                  ? "help"
                  : "overview",
            (options.getInteger("page") ?? 1) - 1,
          );
          return;
        }
        if (sub === "mode") {
          const value = options.getString("value", true);
          if (value !== "monitor" && value !== "protect")
            throw new UserError("panel.invalidChoice");
          await requestGlobalMode(value);
          return;
        }
        if (sub === "setup") {
          const channel = options.getChannel("log-channel");
          if (channel) await setLogChannel(guild, store, channel.id);
          await show("settings");
          return;
        }
        if (sub === "lockdown") {
          const enabled = options.getBoolean("enabled", true);
          await interaction.editReply(
            confirmation(
              guildId,
              userId,
              {
                kind: "lockdown",
                enabled,
                expected: JSON.stringify(store.getConfig(guildId)),
              },
              t(language, "control.lockdownConfirm"),
            ),
          );
          return;
        }
      }
      throw new UserError("error.invalidRoute");
    } catch (error) {
      logger.warn(
        { err: error, guildId: interaction.guildId },
        "Guard interaction failed",
      );
      const payload = {
        content: "",
        embeds: [
          createEmbed(language, {
            title: t(language, "panel.error"),
            description: userErrorText(language, error),
            tone: "error",
          }),
        ],
        components: [
          navigation(interaction.user.id, interaction.guildId, language),
        ],
        allowedMentions: { parse: [] as never[] },
      };
      if (interaction.deferred || interaction.replied)
        await interaction.editReply(payload).catch(() => undefined);
      else
        await interaction
          .reply({ ...payload, flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
    }
  };
}
function stateSummary(
  language: Language,
  enabled: boolean,
  mode: string,
  action: string,
): string {
  return `${t(language, enabled ? "common.enabled" : "common.disabled")} · ${t(language, `mode.${mode}`)} · ${actionName(language, action)}`;
}
