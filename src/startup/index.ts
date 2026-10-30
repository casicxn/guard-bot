import { randomBytes } from "node:crypto";
import { PermissionFlagsBits, type Client } from "discord.js";
import type { Logger } from "pino";
import type { Store, WhitelistEntry } from "../contracts.js";
import type { ManagementControls } from "../control/contracts.js";
import { createProtectionControl } from "../control/protection.js";
import { whitelistSchema } from "../configuration/index.js";
import { createEmbed } from "../discord/embeds.js";
import type { PermanentPanelRecord } from "../discord/permanent-panel.js";
import { languageFor, t, type Language } from "../locales/index.js";
import type { RestartSession, RestartState } from "../restart/contracts.js";
import { MODULES } from "../security/modules.js";

export interface StartupReport {
  guildId: string;
  mode: "monitor" | "protect" | "unavailable";
  zeroTolerance: boolean;
  active: number;
  whitelist: number;
  database: "connected" | "unavailable";
  panel: "restored" | "unavailable" | "pending" | "disabled";
  voice:
    | "connected"
    | "pending"
    | "disabled"
    | "paused"
    | "disconnected"
    | "unavailable";
  restart?: RestartState | "unavailable" | "pending";
  recovery?: { restored: number; total: number; conflicts: number };
  healthy: boolean;
  startedAt: number;
  notification: "sent" | "skipped" | "failed";
}
export interface StartupOptions {
  restorePanels(): Promise<void>;
  coreReady(): boolean;
  refreshPanels?(): Promise<void>;
  now?: () => number;
  readinessTimeoutMs?: number;
}

async function bounded(
  task: Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function buildStartupEmbed(language: Language, report: StartupReport) {
  const status = (value: string) => t(language, `startup.${value}`);
  const mode =
    report.mode === "unavailable"
      ? status("unavailable")
      : report.zeroTolerance && report.mode === "protect"
        ? status("full")
        : status(report.mode);
  return createEmbed(language, {
    title: t(
      language,
      report.healthy ? "startup.title" : "startup.warningTitle",
    ),
    description: t(
      language,
      report.healthy ? "startup.description" : "startup.warningDescription",
    ),
    tone: report.healthy ? "success" : "warning",
  }).addFields(
    { name: t(language, "startup.mode"), value: mode, inline: true },
    {
      name: t(language, "startup.active"),
      value: String(report.active),
      inline: true,
    },
    {
      name: t(language, "startup.whitelist"),
      value: String(report.whitelist),
      inline: true,
    },
    {
      name: t(language, "startup.database"),
      value: status(report.database),
      inline: true,
    },
    {
      name: t(language, "startup.voice"),
      value: status(report.voice),
      inline: true,
    },
    {
      name: t(language, "startup.panel"),
      value: status(report.panel),
      inline: true,
    },
    {
      name: t(language, "startup.restart"),
      value: t(language, `startup.restart.${report.restart ?? "IDLE"}`),
      inline: true,
    },
    ...(report.recovery
      ? [
          {
            name: t(language, "startup.recovery"),
            value: t(language, "startup.recoverySummary", report.recovery),
          },
        ]
      : []),
    {
      name: t(language, "startup.started"),
      value: `<t:${Math.floor(report.startedAt / 1000)}:F>`,
    },
  );
}

/** One coordinator is owned by the process lifecycle, never by gateway reconnects. */
export function createStartupCoordinator(
  client: Client,
  store: Store,
  controls: ManagementControls,
  logger: Logger,
  options: StartupOptions,
) {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const timeout = options.readinessTimeoutMs ?? 20000;
  const protection = createProtectionControl(
    client,
    store,
    controls.authorization,
  );
  let task: Promise<StartupReport[]> | undefined;
  let disposed = false;
  const failedRestorations = new Set<string>();
  async function restore(component: string, operation: () => Promise<void>) {
    let failed = false;
    let failure: unknown;
    const complete = await bounded(
      Promise.resolve()
        .then(operation)
        .catch((error: unknown) => {
          failed = true;
          failedRestorations.add(component);
          failure = error;
          throw error;
        }),
      timeout,
    );
    if (!complete)
      logger.warn(
        {
          category: "WARNING",
          component,
          outcome: failed ? "failed" : "timeout",
          err: failure,
        },
        "Optional startup restoration incomplete; security remains operational",
      );
    return complete;
  }
  async function initialize(): Promise<StartupReport[]> {
    if (!client.isReady())
      throw new Error("Startup restoration requires a ready Discord client");
    const runtimes = Promise.all([
      restore("presence", () => controls.presence.start()),
      restore("voice", () => controls.voice.start()),
    ]);
    const recovery = new Map<
      string,
      {
        state: RestartState | "pending" | "unavailable";
        session?: RestartSession;
      }
    >();
    let recovered = false;
    await Promise.all(
      [...client.guilds.cache.values()].map(async (guild) => {
        if (!controls.restart) return;
        try {
          const existing = controls.restart.get(guild.id);
          if (!existing) {
            recovery.set(guild.id, { state: "IDLE" });
            return;
          }
          if (existing.state === "IDLE" || existing.state === "COMPLETED") {
            recovery.set(guild.id, {
              state: existing.state,
              session: existing,
            });
            return;
          }
          if (!options.coreReady() || disposed) {
            recovery.set(guild.id, {
              state: existing.state,
              session: existing,
            });
            logger.warn(
              { category: "LOCKDOWN", guildId: guild.id },
              "Guard not ready; restart lockdown retained",
            );
            return;
          }
          let result: RestartSession | undefined;
          const component = `restart:${guild.id}`;
          const complete = await restore(component, async () => {
            result = await controls.restart!.recover(guild.id);
          });
          recovered = true;
          recovery.set(
            guild.id,
            complete
              ? { state: result?.state ?? "IDLE", session: result }
              : {
                  state: failedRestorations.has(component)
                    ? "unavailable"
                    : "pending",
                  session: existing,
                },
          );
        } catch (error) {
          recovery.set(guild.id, { state: "unavailable" });
          logger.error(
            { err: error, category: "LOCKDOWN", guildId: guild.id },
            "Restart lockdown recovery failed; saved journal retained",
          );
        }
      }),
    );
    const panelsDone = await restore("panel", options.restorePanels);
    if (recovered && options.refreshPanels)
      await restore("panel refresh", options.refreshPanels);
    const [presenceDone, voiceDone] = await runtimes;
    const reports = await Promise.all(
      [...client.guilds.cache.values()].map(async (guild) => {
        const report: StartupReport = {
          guildId: guild.id,
          mode: "unavailable",
          zeroTolerance: false,
          active: 0,
          whitelist: 0,
          database: "unavailable",
          panel: panelsDone ? "unavailable" : "pending",
          voice: "unavailable",
          restart: recovery.get(guild.id)?.state ?? "IDLE",
          healthy: false,
          startedAt,
          notification: "skipped",
        };
        const restartSession = recovery.get(guild.id)?.session;
        if (restartSession)
          report.recovery = {
            restored: restartSession.roles.filter(
              (role) => role.status === "restored",
            ).length,
            total: restartSession.roles.filter(
              (role) => role.removedPermissions !== "0",
            ).length,
            conflicts: restartSession.roles.filter((role) =>
              ["conflict", "missing", "failed", "uncertain"].includes(
                role.status,
              ),
            ).length,
          };
        let panel: PermanentPanelRecord | undefined;
        let language: Language = "tr";
        try {
          const config = store.getConfig(guild.id);
          language = languageFor(store, guild.id);
          const trusted = store.list<WhitelistEntry>(
            guild.id,
            "whitelist",
            Number.MAX_SAFE_INTEGER,
          );
          report.whitelist = new Set(
            trusted
              .filter(
                (entry) =>
                  whitelistSchema.safeParse(entry).success &&
                  (entry.expiresAt === undefined || entry.expiresAt > now()),
              )
              .map((entry) => `${entry.kind}:${entry.subjectId}`),
          ).size;
          report.database = "connected";
          report.mode = config.mode;
          report.zeroTolerance = config.zeroTolerance === true;
          panel = store.get<PermanentPanelRecord>(
            guild.id,
            "permanent_panel",
            "main",
          );
          report.panel = panel?.panelEnabled
            ? panelsDone
              ? panel.status === "ready"
                ? "restored"
                : "unavailable"
              : failedRestorations.has("panel")
                ? "unavailable"
                : "pending"
            : "disabled";
          const voiceConfig = controls.voice.getConfig(guild.id);
          const voiceState = controls.voice.getState(guild.id);
          report.voice =
            voiceState.status === "ready"
              ? "connected"
              : voiceConfig.manualDisconnect
                ? "paused"
                : !voiceConfig.autoJoin
                  ? "disabled"
                  : voiceState.status === "connecting" ||
                      voiceState.status === "retrying"
                    ? "pending"
                    : voiceState.status === "blocked" ||
                        failedRestorations.has("voice")
                      ? "unavailable"
                      : !voiceDone
                        ? "pending"
                        : "disconnected";
          let health: Awaited<ReturnType<typeof protection.health>> | undefined;
          await bounded(
            protection.health(guild.id).then((value) => {
              health = value;
            }),
            timeout,
          );
          if (health) {
            report.active = health.modules.filter(
              (module) =>
                module.available &&
                MODULES.some(
                  (entry) => entry.id === module.id && entry.administrative,
                ) &&
                config.mode === "protect" &&
                (config.zeroTolerance ||
                  (config.modules[module.id]?.enabled &&
                    config.modules[module.id]?.mode === "protect")),
            ).length;
            report.healthy =
              options.coreReady() &&
              health.auditReady &&
              (config.mode !== "protect" ||
                (!health.unavailable.some(
                  (module) =>
                    config.zeroTolerance ||
                    (config.modules[module.id]?.enabled &&
                      config.modules[module.id]?.mode === "protect"),
                ) &&
                  (!config.zeroTolerance || health.snapshotReady)));
          }
          if (
            !["IDLE", "COMPLETED"].includes(report.restart ?? "IDLE") ||
            !presenceDone ||
            !controls.presence.getState().applied ||
            report.panel === "unavailable" ||
            report.panel === "pending" ||
            ["pending", "unavailable", "disconnected"].includes(report.voice)
          )
            report.healthy = false;
        } catch (error) {
          logger.error(
            { err: error, guildId: guild.id, category: "ERROR" },
            "Startup state restoration failed",
          );
        }
        if (!panel?.panelEnabled || disposed) return report;
        try {
          const channel = await client.channels.fetch(panel.panelChannelId);
          if (
            !channel ||
            !("guild" in channel) ||
            channel.guild.id !== guild.id ||
            !("send" in channel) ||
            typeof channel.send !== "function" ||
            !("permissionsFor" in channel)
          )
            throw new Error("Startup notification channel unavailable");
          const me = guild.members.me ?? (await guild.members.fetchMe());
          const permissions = channel.permissionsFor(me);
          if (
            !permissions?.has([
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
            ])
          )
            throw new Error("Startup notification permissions missing");
          if (disposed) return report;
          await channel.send({
            embeds: [buildStartupEmbed(language, report)],
            allowedMentions: {
              parse: [],
              users: [],
              roles: [],
              repliedUser: false,
            },
            nonce: randomBytes(12).toString("hex"),
            enforceNonce: true,
          });
          report.notification = "sent";
          logger.info(
            { category: "NOTIFY", guildId: guild.id },
            "Startup notification sent",
          );
        } catch (error) {
          report.notification = "failed";
          logger.warn(
            { err: error, category: "WARNING", guildId: guild.id },
            "Startup notification delivery failed; security remains operational",
          );
        }
        return report;
      }),
    );
    if (!disposed)
      logger.info(
        {
          category:
            options.coreReady() && reports.every((report) => report.healthy)
              ? "READY"
              : "WARNING",
          summary: {
            guilds: reports.length,
            modes: reports.map((report) => report.mode).join(", "),
            activeModules: reports.reduce(
              (sum, report) => sum + report.active,
              0,
            ),
            database: reports.every((report) => report.database === "connected")
              ? "connected"
              : "unavailable",
            whitelist: reports.reduce(
              (sum, report) => sum + report.whitelist,
              0,
            ),
            panels: reports.map((report) => report.panel).join(", "),
            voice: reports.map((report) => report.voice).join(", "),
            restart: reports
              .map((report) => report.restart ?? "IDLE")
              .join(", "),
          },
        },
        "Startup complete",
      );
    return reports;
  }
  return {
    start(): Promise<StartupReport[]> {
      return (task ??= disposed ? Promise.resolve([]) : initialize());
    },
    async dispose() {
      disposed = true;
      await task?.catch(() => undefined);
    },
  };
}
