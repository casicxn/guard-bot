import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type InteractionEditReplyOptions,
} from "discord.js";
import type { Logger } from "pino";
import type {
  BackupService,
  Incident,
  Store,
  WhitelistEntry,
} from "../contracts.js";
import type { ManagementControls } from "../control/contracts.js";
import { ownerGuildStore, ownerBackupService } from "../control/access.js";
import {
  createProtectionControl,
  type ProtectionHealth,
} from "../control/protection.js";
import { MODULES } from "../security/index.js";
import {
  t,
  languageFor,
  moduleName,
  moduleDescription,
  actionName,
  type Language,
} from "../locales/index.js";
import { createEmbed } from "./embeds.js";
import { incidentText } from "./presentation.js";
import { isHostileIncident, classifyActivity } from "../security/activity.js";
import { recoveryJobPage } from "./recovery-logs.js";
import { Sessions, type Session } from "./sessions.js";
export const sections = [
  "overview",
  "modules",
  "whitelist",
  "limits",
  "backups",
  "incidents",
  "restart",
  "presence",
  "voice",
  "settings",
  "health",
  "help",
] as const;
export type Section = (typeof sections)[number];
export const isSection = (value: string): value is Section =>
  sections.includes(value as Section);
export const supportsThreshold = (id: string) => id !== "raid.account";
export const state = (language: Language, value: boolean) =>
  t(language, value ? "common.enabled" : "common.disabled");
export const subjectMention = (entry: WhitelistEntry) =>
  entry.kind === "role" ? `<@&${entry.subjectId}>` : `<@${entry.subjectId}>`;
export function protectionHealthText(
  language: Language,
  health: ProtectionHealth,
): string {
  const unavailable = health.unavailable
    .map(
      (module) =>
        `${moduleName(language, module.id)} (${module.missing.map((key) => t(language, `nuke.permission.${key}`)).join(", ")})`,
    )
    .join("\n");
  return (
    t(language, "nuke.health", {
      active: health.active,
      total: health.eligible,
      unavailable: health.unavailable.length,
      snapshot: t(language, health.snapshotReady ? "common.yes" : "common.no"),
    }) +
    "\n" +
    (unavailable
      ? t(language, "nuke.unavailable") + "\n" + unavailable.slice(0, 1250)
      : t(language, "nuke.permissionsReady")) +
    "\n" +
    t(language, "nuke.capabilityLimits")
  );
}
export const groups = [
  "all",
  "channels",
  "roles",
  "members",
  "guild",
  "webhooks",
  "integrations",
  "raids",
  "other",
] as const;
export function moduleGroup(id: string): string {
  if (id.startsWith("channel.")) return "channels";
  if (id.startsWith("role.")) return "roles";
  if (id.startsWith("member.")) return "members";
  if (id.startsWith("guild.")) return "guild";
  if (id.startsWith("webhook.")) return "webhooks";
  if (id.startsWith("integration.") || id.startsWith("automod."))
    return "integrations";
  if (id.startsWith("raid.")) return "raids";
  return "other";
}
export function whitelistEntryText(
  language: Language,
  entry: WhitelistEntry,
): string {
  const old = entry as WhitelistEntry & { addedAt?: number; addedBy?: string };
  const expired =
    entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  return (
    t(language, "panel.whitelistRow", {
      subject: subjectMention(entry),
      type: t(language, `type.${entry.kind}`),
      access: entry.actions.includes("*")
        ? t(language, "panel.whitelistAll")
        : `${t(language, "panel.whitelistSelected", { count: entry.actions.length })}: ${entry.actions
            .map((id) => moduleName(language, id))
            .join(", ")
            .slice(0, 250)}`,
      status: t(language, expired ? "panel.whitelistExpired" : "common.active"),
      expiry: entry.expiresAt
        ? t(language, "panel.whitelistExpires", {
            date: `<t:${Math.floor(entry.expiresAt / 1000)}:f>`,
          })
        : t(language, "panel.whitelistPermanent"),
    }) +
    "\n" +
    t(language, "control.whitelistAdded", {
      date: old.addedAt
        ? `<t:${Math.floor(old.addedAt / 1000)}:f>`
        : t(language, "control.legacyUnknown"),
      actor: old.addedBy
        ? `<@${old.addedBy}>`
        : t(language, "control.legacyUnknown"),
    })
  );
}
export function recoveryDescription(language: Language, id: string): string {
  const strategy = MODULES.find((module) => module.id === id)?.rollback;
  const key =
    strategy === "delete-created"
      ? "created"
      : strategy === "snapshot-recreate"
        ? "deleted"
        : strategy === "audited-fields"
          ? "fields"
          : strategy === "member-role-delta"
            ? "member"
            : strategy === "unban-confirmed"
              ? "ban"
              : strategy === "restore-trusted-ban"
                ? "unban"
                : strategy === "manual-rejoin"
                  ? "kick"
                  : "unsupported";
  return t(language, `nuke.rollback.${key}`);
}
export async function readHealth(
  client: Client,
  store: Store,
  guild: Guild,
  language: Language,
  logger?: Logger,
): Promise<{ healthy: boolean; description: string }> {
  try {
    const me = await guild.members.fetchMe({ force: true });
    const required = {
      ViewAuditLog: PermissionFlagsBits.ViewAuditLog,
      ManageRoles: PermissionFlagsBits.ManageRoles,
      ManageChannels: PermissionFlagsBits.ManageChannels,
      BanMembers: PermissionFlagsBits.BanMembers,
      KickMembers: PermissionFlagsBits.KickMembers,
      ManageGuild: PermissionFlagsBits.ManageGuild,
    };
    const missing = Object.entries(required)
      .filter(([, permission]) => !me.permissions.has(permission))
      .map(([key]) => t(language, `permission.${key}`));
    const unavailable = Object.entries(store.getConfig(guild.id).modules)
      .filter(([, p]) => p.enabled)
      .filter(([id]) =>
        id.startsWith("raid.")
          ? !client.options.intents.has(
              id === "raid.join" || id === "raid.account"
                ? GatewayIntentBits.GuildMembers
                : GatewayIntentBits.GuildMessages,
            )
          : !me.permissions.has(PermissionFlagsBits.ViewAuditLog) ||
            !client.options.intents.has(GatewayIntentBits.GuildModeration),
      )
      .map(([id]) => moduleName(language, id));
    return {
      healthy: missing.length === 0 && unavailable.length === 0,
      description: t(language, "panel.healthBody", {
        ping:
          client.ws.ping < 0 ? t(language, "common.unknown") : client.ws.ping,
        audit: state(
          language,
          me.permissions.has(PermissionFlagsBits.ViewAuditLog),
        ),
        missing: missing.join(", ") || t(language, "common.none"),
        unavailable: unavailable.join(", ") || t(language, "common.none"),
        role: me.roles.highest.name,
        members: state(
          language,
          client.options.intents.has(GatewayIntentBits.GuildMembers),
        ),
        messages: state(
          language,
          client.options.intents.has(GatewayIntentBits.GuildMessages),
        ),
      }),
    };
  } catch (error) {
    logger?.warn({ err: error, guildId: guild.id }, "Health lookup failed");
    return {
      healthy: false,
      description: t(language, "panel.healthUnavailable"),
    };
  }
}
export function createPanels(
  client: Client,
  rawStore: Store,
  rawBackup: BackupService,
  sessions: Sessions,
  logger: Logger | undefined,
  controls: ManagementControls,
) {
  return async function panel(
    guild: Guild,
    userId: string,
    section: Section = "overview",
    requestedPage = 0,
    moduleId?: string,
    extra: Partial<Session> = {},
  ): Promise<InteractionEditReplyOptions> {
    controls.authorization.assertOwner(userId);
    const store = ownerGuildStore(
        rawStore,
        controls.authorization,
        userId,
        guild.id,
      ),
      backup = ownerBackupService(
        rawBackup,
        controls.authorization,
        userId,
        guild.id,
      ),
      config = store.getConfig(guild.id),
      language = languageFor(store, guild.id);
    const group = groups.includes(extra.group as (typeof groups)[number])
        ? extra.group!
        : "all",
      view = extra.view ?? "",
      filter = ["all", "critical", "unresolved", "failed"].includes(
        extra.filter ?? "",
      )
        ? extra.filter!
        : "all";
    const ids = MODULES.map((m) => m.id).filter(
      (id) =>
        config.modules[id] && (group === "all" || moduleGroup(id) === group),
    );
    let page = Number.isSafeInteger(requestedPage)
      ? Math.max(0, Math.min(10000, requestedPage))
      : 0;
    if (section === "modules" || section === "limits") {
      page = Math.min(page, Math.max(0, Math.ceil(ids.length / 20) - 1));
      if (moduleId && ids.includes(moduleId))
        page = Math.floor(ids.indexOf(moduleId) / 20);
      moduleId = moduleId && ids.includes(moduleId) ? moduleId : ids[page * 20];
    }
    const token = sessions.create(userId, guild.id, {
      section,
      page,
      moduleId,
      group,
      view,
      filter,
      backupId: extra.backupId,
      scope: extra.scope,
      jobId: extra.jobId,
    });
    const id = (operation: string) => `guard:${operation}:${token}`;
    const button = (
      operation: string,
      key: string,
      style = ButtonStyle.Secondary,
    ) =>
      new ButtonBuilder()
        .setCustomId(id(operation))
        .setLabel(t(language, key))
        .setStyle(style);
    const nav = new StringSelectMenuBuilder()
      .setCustomId(id("section"))
      .setPlaceholder(t(language, "control.navigation"))
      .addOptions(
        sections.map((value) => ({
          label: t(language, `control.section.${value}`),
          value,
        })),
      );
    const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("back", "common.back").setDisabled(section === "overview"),
      button("main", "control.main").setDisabled(section === "overview"),
      button("refresh", "control.refresh"),
    );
    if (
      ["modules", "limits", "whitelist", "backups", "incidents"].includes(
        section,
      )
    )
      navigation.addComponents(
        button("prev", "common.previous").setDisabled(page === 0),
        button("next", "common.next"),
      );
    const rows: Array<
      NonNullable<InteractionEditReplyOptions["components"]>[number]
    > = [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(nav),
      navigation,
    ];
    const addSelect = (
      operation: string,
      key: string,
      options: {
        label: string;
        value: string;
        description?: string;
        default?: boolean;
      }[],
    ) => {
      if (options.length)
        rows.push(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(id(operation))
              .setPlaceholder(t(language, key))
              .addOptions(options),
          ),
        );
    };
    let description = "",
      tone: "success" | "warning" | "info" = "info",
      title = t(language, "control.title");
    if (section !== "overview")
      title += ` · ${t(language, `control.section.${section}`)}`;
    if (section === "overview") {
      const health = await readHealth(client, store, guild, language, logger),
        presence = controls.presence.getState(),
        voice = controls.voice.getState(guild.id),
        recent = store
          .list<Incident>(guild.id, "incidents")
          .filter(
            (item) =>
              isHostileIncident(item) &&
              item.createdAt >= Date.now() - 86400000,
          ).length;
      const response =
        config.mode === "protect" &&
        Object.entries(config.modules).some(
          ([key, p]) =>
            Boolean(
              MODULES.find((module) => module.id === key)?.administrative,
            ) &&
            p.enabled &&
            p.mode === "protect" &&
            p.action !== "log",
        );
      tone = health.healthy ? "success" : "warning";
      description = t(language, "control.overview", {
        server: guild.name ?? guild.id,
        mode: t(language, `mode.${config.mode}`),
        response: t(
          language,
          response ? "panel.configured" : "panel.monitoring",
        ),
        enabled: Object.values(config.modules).filter((p) => p.enabled).length,
        total: Object.keys(config.modules).length,
        incidents: recent,
        health: t(
          language,
          health.healthy ? "panel.healthy" : "panel.degraded",
        ),
        language: language === "tr" ? "Türkçe" : "English",
        presence: t(language, `control.presence.status.${presence.status}`),
        voice: t(language, `control.voice.state.${voice.status}`),
        warning: t(
          language,
          health.healthy ? "panel.overviewSafe" : "panel.overviewWarning",
        ),
      });
      const protection = await createProtectionControl(
        client,
        rawStore,
        controls.authorization,
      ).health(guild.id);
      const latest = store
        .list<Incident>(guild.id, "incidents")
        .filter(isHostileIncident)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      const contained = store
        .list<{
          executorId?: string;
          updatedAt?: number;
          status?: string;
          removedRoleIds?: string[];
        }>(guild.id, "containment_records")
        .filter((item) => item.status === "contained")
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
      const recovery = store.list<{
        state?: string;
        status?: string;
        outcome?: { status?: string };
        result?: { status?: string };
      }>(guild.id, "rollback_attempts", 1)[0];
      const recoveryStatus =
        recovery?.outcome?.status ??
        recovery?.status ??
        recovery?.result?.status;
      const recoveryPending =
        recovery?.state === "pending" ||
        recoveryStatus === "pending" ||
        recoveryStatus === "running";
      const recoveryIssue = Boolean(
        recovery && !recoveryPending && recoveryStatus !== "succeeded",
      );
      description +=
        "\n\n" +
        protectionHealthText(language, protection) +
        "\n\n" +
        t(language, "nuke.overviewRecent", {
          incident: latest
            ? `${moduleName(language, latest.event.action)} · <t:${Math.floor(latest.createdAt / 1000)}:R>`
            : t(language, "common.none"),
          executor: contained?.executorId
            ? `<@${contained.executorId}>`
            : t(language, "common.none"),
          recovery: t(
            language,
            recoveryPending
              ? "nuke.recoveryPending"
              : recoveryIssue
                ? "nuke.recoveryIssue"
                : recovery
                  ? "nuke.recoveryRecorded"
                  : "nuke.recoveryNone",
          ),
        });
      if (
        protection.unavailable.length ||
        !protection.snapshotReady ||
        recoveryPending ||
        recoveryIssue
      )
        tone = "warning";
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button(
            "global-protection",
            config.mode === "protect" ? "nuke.switchMonitor" : "nuke.enable",
            config.mode === "protect"
              ? ButtonStyle.Secondary
              : ButtonStyle.Success,
          ),
        ),
      );
    }
    if (section === "modules" || section === "limits") {
      const policy = moduleId ? config.modules[moduleId] : undefined;
      const administrative = Boolean(
        MODULES.find((module) => module.id === moduleId)?.administrative,
      );
      const profileManaged =
        config.mode === "protect" &&
        config.zeroTolerance === true &&
        administrative;
      if (policy && moduleId) {
        const key =
          moduleId === "raid.join"
            ? "panel.thresholdJoin"
            : moduleId === "raid.message"
              ? "panel.thresholdMessage"
              : moduleId === "raid.mention"
                ? "panel.thresholdMention"
                : "panel.threshold";
        description = `**${moduleName(language, moduleId)}**\n${t(language, "panel.moduleBody", { description: moduleDescription(language, moduleId), enabled: state(language, policy.enabled), mode: t(language, `mode.${!administrative ? "monitor" : policy.mode}`), action: actionName(language, !administrative ? "log" : policy.action), threshold: supportsThreshold(moduleId) ? t(language, key, { count: policy.threshold, seconds: policy.windowMs / 1000 }) : t(language, "panel.accountRule"), warning: t(language, moduleId.startsWith("raid.") ? "panel.raidOnly" : !administrative ? "nuke.participationOnly" : "panel.protectGates") })}\n\n**${t(language, "control.recoveryHeading")}**\n${recoveryDescription(language, moduleId)}`;
      } else description = t(language, "panel.modulesIntro");
      if (profileManaged)
        description += "\n\n" + t(language, "nuke.profileManaged");
      if (
        view === "mode" &&
        policy &&
        moduleId &&
        administrative &&
        !profileManaged
      ) {
        addSelect(
          "module-mode",
          "panel.moduleMode",
          ["monitor", "protect"].map((value) => ({
            label: t(language, `mode.${value}`),
            value,
            default: value === policy.mode,
          })),
        );
      } else if (
        view === "response" &&
        policy &&
        moduleId &&
        administrative &&
        !profileManaged
      ) {
        addSelect(
          "module-action",
          "panel.moduleAction",
          ["log", "warn", "strip", "kick", "ban", "lockdown", "reverse"].map(
            (value) => ({
              label: actionName(language, value),
              value,
              default: value === policy.action,
            }),
          ),
        );
      } else if (view === "recovery" && policy && moduleId) {
        description = `**${moduleName(language, moduleId)}**\n\n${recoveryDescription(language, moduleId)}\n\n${t(language, "control.recoveryConfigured", { action: actionName(language, policy.action) })}`;
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button("open-backups", "control.openBackups"),
            button("response-view", "control.moduleResponse"),
          ),
        );
      } else {
        addSelect(
          "group",
          "control.group",
          groups.map((value) => ({
            label: t(language, `control.group.${value}`),
            value,
          })),
        );
        addSelect(
          "module",
          "control.moduleChoose",
          ids.slice(page * 20, page * 20 + 20).map((value) => ({
            label: moduleName(language, value).slice(0, 100),
            description: moduleDescription(language, value).slice(0, 100),
            value,
          })),
        );
        if (moduleId && policy) {
          const actions = new ActionRowBuilder<ButtonBuilder>();
          if (section === "modules") {
            actions.addComponents(
              button(
                "toggle",
                policy.enabled ? "panel.disable" : "panel.enable",
              ).setDisabled(profileManaged),
            );
            if (administrative)
              actions.addComponents(
                button("mode-view", "control.moduleMode").setDisabled(
                  profileManaged,
                ),
              );
          }
          if (supportsThreshold(moduleId))
            actions.addComponents(
              button(
                "limit-edit",
                "panel.editLimits",
                ButtonStyle.Primary,
              ).setDisabled(profileManaged),
            );
          if (section === "modules" && administrative)
            actions.addComponents(
              button("response-view", "control.moduleResponse").setDisabled(
                profileManaged,
              ),
              button("recovery-view", "control.moduleRecovery"),
            );
          rows.push(actions);
        }
      }
    }
    if (section === "whitelist") {
      const entries = store.list<WhitelistEntry>(
        guild.id,
        "whitelist",
        5,
        page * 5,
      );
      description =
        t(language, "control.whitelistIntro") +
        "\n\n" +
        (entries
          .map((entry) => whitelistEntryText(language, entry))
          .join("\n\n") || t(language, "whitelist.empty"));
      rows.push(
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(id("trust-user"))
            .setPlaceholder(t(language, "whitelist.chooseUser"))
            .setMaxValues(1),
        ),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(id("trust-role"))
            .setPlaceholder(t(language, "whitelist.chooseRole"))
            .setMaxValues(1),
        ),
      );
      const distinct = [
        ...new Map(entries.map((entry) => [entry.subjectId, entry])).values(),
      ];
      addSelect(
        "whitelist-remove",
        "control.removeChoose",
        distinct.map((entry) => ({
          label:
            `${t(language, `type.${entry.kind}`)}: ${entry.subjectId}`.slice(
              0,
              100,
            ),
          value: entry.subjectId,
          description: entry.actions.includes("*")
            ? t(language, "panel.whitelistAll")
            : t(language, "panel.whitelistSelected", {
                count: entry.actions.length,
              }),
        })),
      );
    }
    if (section === "backups") {
      if (view === "jobs") {
        if (extra.jobId) {
          const result = recoveryJobPage(store, guild.id, extra.jobId, page);
          title = result.title;
          description = result.description;
        } else {
          const jobs = store.list<{
            id: string;
            state: string;
            snapshotId: string;
          }>(guild.id, "recovery_jobs", 20, page * 20);
          description =
            jobs
              .map((job) => `${job.id} · ${t(language, `status.${job.state}`)}`)
              .join("\n") || t(language, "control.jobsEmpty");
          addSelect(
            "job-select",
            "control.jobSelect",
            jobs.map((job) => ({
              label: job.id,
              value: job.id,
              description: t(language, `status.${job.state}`),
            })),
          );
        }
      } else if (extra.backupId) {
        const snapshot = store.get<{
          createdAt: number;
          roles?: unknown[];
          channels?: unknown[];
        }>(guild.id, "backups", extra.backupId);
        if (!snapshot) throw new Error(t(language, "panel.backupMissing"));
        description = t(language, "control.backupDetails", {
          id: extra.backupId,
          date: `<t:${Math.floor(snapshot.createdAt / 1000)}:f>`,
          roles: Array.isArray(snapshot.roles)
            ? snapshot.roles.length
            : t(language, "common.unknown"),
          channels: Array.isArray(snapshot.channels)
            ? snapshot.channels.length
            : t(language, "common.unknown"),
        });
        addSelect(
          "backup-scope",
          "control.backupScope",
          ["all", "roles", "channels", "guild"].map((value) => ({
            label: t(language, `ops.scope.${value}`).slice(0, 100),
            value,
            default: value === (extra.scope ?? "all"),
          })),
        );
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button(
              "backup-preview",
              "control.backupPreview",
              ButtonStyle.Primary,
            ),
            button("backup-delete", "control.backupDelete", ButtonStyle.Danger),
            button("settings", "panel.retention"),
          ),
        );
      } else {
        const snapshots = backup
          .list(guild.id)
          .slice(page * 20, page * 20 + 20);
        description =
          t(language, "panel.backupsIntro") +
          "\n\n" +
          (snapshots.length
            ? snapshots
                .map(
                  (item) =>
                    `<t:${Math.floor(item.createdAt / 1000)}:f> · ${item.id}`,
                )
                .join("\n")
            : t(language, "panel.backupsEmpty"));
        addSelect(
          "backup-select",
          "panel.backupChoose",
          snapshots.map((item) => ({
            label: t(language, "panel.backupLabel", {
              date: new Date(item.createdAt).toISOString(),
            }).slice(0, 100),
            value: item.id,
          })),
        );
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button("backup-create", "panel.backupCreate", ButtonStyle.Success),
            button("settings", "panel.retention"),
            button("backup-jobs", "control.backupJobs"),
          ),
        );
      }
    }
    if (section === "incidents") {
      const incidents = store
        .list<Incident>(guild.id, "incidents")
        .filter(isHostileIncident)
        .filter((item) =>
          filter === "critical"
            ? item.event.severity === "critical"
            : filter === "unresolved"
              ? item.confidence !== "confirmed"
              : filter === "failed"
                ? classifyActivity(item) === "failed" ||
                  item.status === "failed"
                : true,
        );
      description =
        incidents
          .slice(page * 2, page * 2 + 2)
          .map((item) => incidentText(language, item))
          .join("\n\n") || t(language, "panel.incidentsEmpty");
      addSelect(
        "incident-filter",
        "control.incidentFilter",
        ["all", "critical", "unresolved", "failed"].map((value) => ({
          label: t(language, `control.filter.${value}`),
          value,
        })),
      );
    }
    if (section === "restart") {
      const restart = controls.restart;
      let current: import("../restart/contracts.js").RestartSession | undefined;
      let journalUnavailable = false;
      try {
        current = restart?.get(guild.id);
      } catch (error) {
        journalUnavailable = true;
        logger?.warn(
          { err: error, guildId: guild.id },
          "Restart journal unavailable for panel",
        );
      }
      const locked =
        current?.roles.filter((role) => role.status === "locked").length ?? 0;
      const restored =
        current?.roles.filter((role) => role.status === "restored").length ?? 0;
      const risks = current?.risks.length ?? 0;
      description =
        t(language, "restart.summary", {
          state: t(
            language,
            "restart.state." +
              (journalUnavailable
                ? "MANUAL_RECOVERY_REQUIRED"
                : (current?.state ?? "IDLE")),
          ),
          affected: current?.roles.length ?? 0,
          locked,
          restored,
          risks,
          snapshot: t(language, current ? "common.yes" : "common.no"),
        }) +
        "\n\n" +
        t(language, "restart.limits");
      if (!restart) description += "\n\n" + t(language, "restart.unavailable");
      const details = ["snapshot", "roles", "report"].includes(view);
      if (details && current) {
        const items =
          view === "report"
            ? current.transitions.map((item) =>
                t(language, "restart.transition", {
                  state: t(language, "restart.state." + item.state),
                  time: Math.floor(item.at / 1000),
                }),
              )
            : current.roles.map((role) =>
                t(language, "restart.role", {
                  name: role.name,
                  id: role.roleId,
                  status: t(language, "restart.roleStatus." + role.status),
                  original: role.originalPermissions,
                  locked: role.lockedPermissions,
                  removed: role.removedPermissions,
                  actual: role.actualPermissions ?? "—",
                }),
              );
        const pageCount = Math.max(1, Math.ceil(items.length / 4));
        page = Math.min(page, pageCount - 1);
        description +=
          "\n\n" +
          t(language, "restart.detailHeading." + view) +
          "\n" +
          (items.slice(page * 4, page * 4 + 4).join("\n\n") ||
            t(language, "common.none"));
        if (view === "report")
          description +=
            "\n\n" +
            t(language, "restart.riskCount", { count: risks }) +
            "\n" +
            current.risks
              .slice(0, 12)
              .map((risk) => {
                const [code, ...targets] = risk.split(":");
                return t(
                  language,
                  [
                    "owner-unrestricted",
                    "unmanageable",
                    "bot-shared",
                    "overwrite",
                    "missing-manage-roles",
                    "cannot-restore",
                    "preflight-failed",
                  ].includes(code!)
                    ? "restart.risk." + code
                    : "restart.needsReview",
                  { target: targets.join(":") },
                );
              })
              .join("\n");
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button("prev", "common.previous").setDisabled(page === 0),
            button("next", "common.next").setDisabled(page >= pageCount - 1),
          ),
        );
      } else {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button(
              "restart-prepare",
              "restart.prepare",
              ButtonStyle.Primary,
            ).setDisabled(!restart || journalUnavailable),
            button(
              "restart-activate",
              "restart.activate",
              ButtonStyle.Danger,
            ).setDisabled(!restart || !current?.canActivate),
            button(
              "restart-restore",
              "restart.restore",
              ButtonStyle.Danger,
            ).setDisabled(!restart || !current),
            button("restart-cancel", "common.cancel").setDisabled(
              !restart || !current,
            ),
          ),
        );
        addSelect(
          "restart-detail",
          "restart.details",
          ["snapshot", "roles", "report"].map((value) => ({
            label: t(language, "restart.detailHeading." + value),
            value,
          })),
        );
      }
    }
    if (section === "presence") {
      const runtime = controls.presence.getState();
      description = t(language, "profile.readOnlyBody", {
        status: t(language, `control.presence.status.${runtime.status}`),
        type: t(language, `control.presence.activity.${runtime.activityType}`),
        text: runtime.text || t(language, "common.none"),
        applied: t(language, runtime.applied ? "common.yes" : "common.no"),
      });
    }
    if (section === "voice") {
      navigation.addComponents(
        button("voice-id", "control.voice.id", ButtonStyle.Primary),
      );
      const voice = controls.voice.getConfig(guild.id),
        runtime = controls.voice.getState(guild.id);
      description = t(language, "control.voiceBody", {
        selected: voice.channelId
          ? `<#${voice.channelId}>`
          : t(language, "common.notConfigured"),
        state: t(language, `control.voice.state.${runtime.status}`),
        connected: runtime.channelId
          ? `<#${runtime.channelId}>`
          : t(language, "common.none"),
        auto: state(language, voice.autoJoin),
        mute: state(language, voice.selfMute),
        deaf: state(language, voice.selfDeaf),
        retry: runtime.retryCount,
        paused: state(language, voice.manualDisconnect),
        reason: runtime.reason
          ? t(
              language,
              runtime.reason.startsWith("runtime.")
                ? runtime.reason
                : "control.voice.needsReview",
            )
          : "",
      });
      description += "\n\n" + t(language, "control.voiceChooseHelp");
      rows.push(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(id("voice-channel"))
            .setPlaceholder(t(language, "control.voiceChoose"))
            .setChannelTypes(ChannelType.GuildVoice)
            .setMaxValues(1),
        ),
      );
      addSelect(
        "voice-action",
        "control.voiceAction",
        [
          "auto-on",
          "auto-off",
          "connect",
          "disconnect",
          "reconnect",
          "mute",
          "deaf",
          "id",
        ].map((value) => ({
          label: t(language, `control.voice.${value}`),
          value,
        })),
      );
    }
    if (section === "settings") {
      const c = config as typeof config & { notificationsEnabled?: boolean };
      description = t(language, "control.settingsBody", {
        language: language === "tr" ? "Türkçe" : "English",
        mode: t(language, `mode.${config.mode}`),
        notifications: state(language, c.notificationsEnabled !== false),
        channel: config.logChannelId
          ? `<#${config.logChannelId}>`
          : t(language, "common.notConfigured"),
      });
      if (view === "mode") {
        addSelect(
          "global-mode",
          "control.securityMode",
          ["monitor", "protect"].map((value) => ({
            label: t(language, `mode.${value}`),
            value,
            default: value === config.mode,
          })),
        );
        description +=
          "\n\n" +
          t(language, "control.lockdownBody", {
            state: state(language, config.lockdown),
          });
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button(
              "lockdown",
              config.lockdown
                ? "control.lockdownDisable"
                : "control.lockdownEnable",
              ButtonStyle.Danger,
            ),
          ),
        );
      } else {
        addSelect("language", "panel.language", [
          { label: "🇹🇷 Türkçe", value: "tr", default: language === "tr" },
          { label: "🇬🇧 English", value: "en", default: language === "en" },
        ]);
        rows.push(
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId(id("log-channel"))
              .setPlaceholder(t(language, "control.logChannel"))
              .setChannelTypes(ChannelType.GuildText)
              .setMaxValues(1),
          ),
        );
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button("settings-mode", "control.securityMode"),
            button("notifications", "control.notifications"),
            button("settings", "panel.retention"),
            button("reset", "control.reset", ButtonStyle.Danger),
            button("developer", "control.developer"),
          ),
        );
      }
    }
    if (section === "health") {
      const health = await readHealth(client, store, guild, language, logger);
      tone = health.healthy ? "success" : "warning";
      store.list(guild.id, "incidents", 1);
      const presence = controls.presence.getState(),
        voice = controls.voice.getState(guild.id);
      description =
        health.description +
        "\n\n" +
        t(language, "control.healthExtra", {
          ready: t(language, client.isReady() ? "common.yes" : "common.no"),
          uptime:
            client.uptime === null
              ? t(language, "common.unknown")
              : t(language, "control.uptime", {
                  seconds: Math.floor(client.uptime / 1000),
                }),
          database: t(language, "control.databaseReady"),
          presence: t(language, `control.presence.status.${presence.status}`),
          voice: t(language, `control.voice.state.${voice.status}`),
          voiceIntent: state(
            language,
            client.options.intents.has(GatewayIntentBits.GuildVoiceStates),
          ),
        });
    }
    if (section === "help") description = t(language, "control.help");
    return {
      content: "",
      embeds: [
        createEmbed(language, {
          title,
          description: description.slice(0, 3900),
          tone,
          footer: t(language, "control.ownerOnly", { page: page + 1 }),
        }),
      ],
      components: rows,
      allowedMentions: { parse: [] },
    };
  };
}
