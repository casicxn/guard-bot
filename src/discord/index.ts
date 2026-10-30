import type { ManagementControls } from "../control/contracts.js";
import { Events, type ClientEvents, type Client } from "discord.js";
import type { Logger } from "pino";
import type { BackupService, SecurityProcessor, Store } from "../contracts.js";
import { actionForAudit } from "../security/index.js";
import { AuditFallback, normalizeAudit } from "./audit.js";
import { Sessions } from "./sessions.js";
import { createManagement } from "./management.js";
import { createPanels } from "./panels.js";
import { createPermanentPanel } from "./permanent-panel.js";
import { createPermanentRouter } from "./permanent-router.js";
export { commandData } from "./commands.js";
export { createAdapter } from "./adapter.js";
const installedClients = new WeakSet<Client>();
export type DiscordInstallation = (() => Promise<void>) & {
  restorePanels: () => Promise<void>;
  refreshPanels: () => Promise<void>;
};
export function installDiscord(
  client: Client,
  store: Store,
  processor: SecurityProcessor,
  backup: BackupService,
  logger: Logger,
  controls: ManagementControls,
  options: { coordinatedStartup?: boolean } = {},
): DiscordInstallation {
  if (installedClients.has(client))
    throw new Error(
      "Discord security listeners already installed for this client",
    );
  installedClients.add(client);
  const sessions = new Sessions();
  const pending = new Set<Promise<unknown>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const listeners: (() => void)[] = [];
  let stopped = false;
  function on<E extends keyof ClientEvents>(
    event: E,
    handler: (...args: ClientEvents[E]) => void,
  ): void {
    client.on(event, handler);
    listeners.push(() => client.off(event, handler));
  }
  const safe = (task: Promise<unknown>) => {
    const tracked = task.catch((error) =>
      logger.error({ err: error }, "Discord handler failed"),
    );
    pending.add(tracked);
    void tracked.then(
      () => pending.delete(tracked),
      () => pending.delete(tracked),
    );
  };
  const auditSeen = new Map<string, number>();
  const fallback = new AuditFallback();
  const raidWindows = new Map<string, number[]>();
  function observed(guildId: string, action: string, targetId: string): void {
    if (stopped) return;
    const timestamp = Date.now();
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (stopped) return;
      const auditTime = auditSeen.get(`${guildId}:${action}:${targetId}`);
      if (auditTime !== undefined && Math.abs(auditTime - timestamp) < 10000)
        return;
      safe(
        (async () => {
          const event = {
            id: `gateway:${action}:${targetId}:${timestamp}`,
            guildId,
            action,
            targetId,
            executorId: null,
            timestamp,
            source: "gateway" as const,
          };
          let resolved;
          try {
            const guild = client.guilds?.cache.get(guildId);
            if (guild) resolved = await fallback.resolve(guild, event);
          } catch (error) {
            logger.warn({ err: error, guildId }, "Audit fallback unavailable");
          }
          if (!stopped) await processor.process(resolved ?? event);
        })(),
      );
    }, 3000);
    timers.add(timer);
    timer.unref();
  }
  function raid(
    guildId: string,
    action: string,
    targetId: string,
    weight = 1,
  ): void {
    const policy = store.getConfig(guildId).modules[action];
    if (!policy?.enabled) return;
    const now = Date.now(),
      key = `${guildId}:${action}:${action === "raid.join" ? "guild" : targetId}`;
    for (const [id, times] of raidWindows)
      if ((times[times.length - 1] ?? 0) < now - 3600000)
        raidWindows.delete(id);
    if (raidWindows.size > 10000)
      raidWindows.delete(raidWindows.keys().next().value!);
    const values = (raidWindows.get(key) ?? []).filter(
      (t) => t > now - policy.windowMs,
    );
    values.push(...Array<number>(Math.min(weight, 1000)).fill(now));
    raidWindows.set(key, values.slice(-policy.threshold));
    if (values.length >= policy.threshold) {
      raidWindows.delete(key);
      safe(
        processor.process({
          id: `raid:${action}:${targetId}:${now}`,
          guildId,
          action,
          targetId,
          executorId: null,
          timestamp: now,
          source: "gateway",
          changes: { count: values.length, windowMs: policy.windowMs },
        }),
      );
    }
  }

  const legacy = createManagement(
    client,
    store,
    backup,
    logger,
    sessions,
    controls,
  );
  const permanent = createPermanentPanel(
    client,
    store,
    logger,
    sessions,
    controls,
    createPanels(client, store, backup, sessions, logger, controls),
  );
  const handle = createPermanentRouter(
    store,
    logger,
    sessions,
    controls,
    permanent,
    legacy,
  );
  if (!options.coordinatedStartup) {
    on(Events.ClientReady, () => safe(permanent.start()));
    if (client.isReady?.()) safe(permanent.start());
  }
  on(Events.InteractionCreate, (interaction) => safe(handle(interaction)));
  on(Events.ChannelCreate, (channel) => {
    if ("guild" in channel)
      observed(channel.guild.id, "channel.create", channel.id);
  });
  on(Events.ChannelDelete, (channel) => {
    if ("guild" in channel)
      observed(channel.guild.id, "channel.delete", channel.id);
  });
  on(Events.GuildRoleCreate, (role) =>
    observed(role.guild.id, "role.create", role.id),
  );
  on(Events.GuildRoleDelete, (role) =>
    observed(role.guild.id, "role.delete", role.id),
  );
  on(Events.GuildMemberAdd, (member) =>
    safe(
      (async () => {
        raid(member.guild.id, "raid.join", member.id);
        if (Date.now() - member.user.createdTimestamp < 7 * 86400000)
          raid(member.guild.id, "raid.account", member.id);
      })(),
    ),
  );
  on(Events.MessageCreate, (message) =>
    safe(
      (async () => {
        if (!message.guildId || message.author.bot) return;
        raid(message.guildId, "raid.message", message.author.id);
        const mentions =
          message.mentions.users.size +
          message.mentions.roles.size +
          (message.mentions.everyone ? 1 : 0);
        if (mentions)
          raid(message.guildId, "raid.mention", message.author.id, mentions);
      })(),
    ),
  );
  on(Events.GuildAuditLogEntryCreate, (entry, guild) =>
    safe(
      (async () => {
        const action = actionForAudit(entry.action);
        if (!action) return;
        if (entry.targetId) {
          const now = Date.now();
          for (const [key, time] of auditSeen)
            if (time < now - 60000) auditSeen.delete(key);
          auditSeen.set(`${guild.id}:${action}:${entry.targetId}`, now);
        }
        const normalized = await normalizeAudit(entry, guild);
        if (normalized) await processor.process(normalized);
      })(),
    ),
  );
  const dispose = async () => {
    stopped = true;
    for (const remove of listeners) remove();
    await permanent.dispose();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    while (pending.size) await Promise.allSettled([...pending]);
    auditSeen.clear();
    raidWindows.clear();
    fallback.clear();
    installedClients.delete(client);
  };
  return Object.assign(dispose, {
    restorePanels: () => permanent.start(),
    refreshPanels: () => permanent.refreshAll(),
  });
}
