import {
  PermissionFlagsBits,
  GuildVerificationLevel,
  type Client,
  type Guild,
} from "discord.js";
import type { Logger } from "pino";
import type { EnforcementAdapter, Store, SecurityEvent } from "../contracts.js";
import { reverseAuditEvent } from "../recovery/index.js";
import { createSecurityLogDelivery } from "./security-log.js";
import { DANGEROUS_PERMISSIONS } from "../security/modules.js";
import { createContainment } from "./containment.js";
import { recordTrustedHistory } from "../recovery/trusted-history.js";
import { createRollbackEngine } from "../recovery/rollback.js";
export const DANGEROUS = DANGEROUS_PERMISSIONS;
export async function setLockdown(
  guild: Guild,
  store: Store,
  enabled: boolean,
): Promise<string> {
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has(PermissionFlagsBits.ManageGuild))
    throw new Error("Missing Manage Server permission.");
  const config = store.getConfig(guild.id);
  if (enabled) {
    if (!store.get(guild.id, "lockdown", "verification"))
      store.put(guild.id, "lockdown", "verification", {
        level: guild.verificationLevel,
      });
    await guild.setVerificationLevel(
      GuildVerificationLevel.VeryHigh,
      "Ultimate Guard emergency verification",
    );
    config.lockdown = true;
  } else {
    const previous = store.get<{ level: GuildVerificationLevel }>(
      guild.id,
      "lockdown",
      "verification",
    );
    if (!previous) throw new Error("No saved verification setting.");
    await guild.setVerificationLevel(
      previous.level,
      "Ultimate Guard end emergency verification",
    );
    config.lockdown = false;
    store.delete(guild.id, "lockdown", "verification");
  }
  store.setConfig(guild.id, config);
  return enabled
    ? "Very High verification enabled. Existing members are not frozen."
    : "Previous verification setting restored.";
}
export function createAdapter(
  client: Client,
  store: Store,
  logger: Logger,
  botOwnerId?: string,
): EnforcementAdapter {
  const contain = createContainment(client, store, logger, botOwnerId);
  const rollback = createRollbackEngine(client, store, logger);
  const getGuild = async (event: SecurityEvent) =>
    client.guilds.fetch({ guild: event.guildId, force: true });
  return {
    contain,
    rollback,
    async observeTrusted(event) {
      recordTrustedHistory(store, event);
    },
    async context(event) {
      const guild = await getGuild(event);
      if (!client.user) throw new Error("Discord client not ready.");
      const me = await guild.members.fetchMe({ force: true });
      if (!me.permissions.has(PermissionFlagsBits.ViewAuditLog))
        throw new Error(
          "View Audit Log permission unavailable; protection degraded.",
        );
      const member =
        event.executorId &&
        event.executorId !== guild.ownerId &&
        event.executorId !== client.user.id &&
        event.executorId !== botOwnerId
          ? await guild.members.fetch({ user: event.executorId, force: true })
          : null;
      return {
        botOwnerId,
        ownerId: guild.ownerId,
        selfId: client.user.id,
        roleIds: member ? [...member.roles.cache.keys()] : [],
        isBot: member?.user.bot ?? false,
      };
    },
    async enforce(event, action) {
      if (action === "log") return "Recorded without enforcement.";
      if (action === "warn")
        return "Security warning recorded for incident channel.";
      const guild = await getGuild(event);
      if (
        !event.executorId ||
        event.executorId === guild.ownerId ||
        event.executorId === client.user?.id ||
        event.executorId === botOwnerId
      )
        throw new Error("Protected or unknown executor.");
      if (action === "reverse") return reverseAuditEvent(client, event, store);
      if (action === "lockdown") return setLockdown(guild, store, true);
      await guild.roles.fetch();
      const [member, me] = await Promise.all([
        guild.members.fetch({ user: event.executorId, force: true }),
        guild.members.fetchMe({ force: true }),
      ]);
      if (me.roles.highest.comparePositionTo(member.roles.highest) <= 0)
        throw new Error("Executor at or above bot hierarchy.");
      if (action === "kick") {
        if (
          !me.permissions.has(PermissionFlagsBits.KickMembers) ||
          !member.kickable
        )
          throw new Error("Missing permission or hierarchy for kick.");
        await member.kick(`Ultimate Guard ${event.action}`);
        return "Executor kicked.";
      }
      if (action === "ban") {
        if (
          !me.permissions.has(PermissionFlagsBits.BanMembers) ||
          !member.bannable
        )
          throw new Error("Missing permission or hierarchy for ban.");
        await member.ban({
          reason: `Ultimate Guard ${event.action}`,
          deleteMessageSeconds: 0,
        });
        return "Executor banned; messages retained.";
      }
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
        throw new Error("Missing Manage Roles.");
      const roles = member.roles.cache.filter(
        (role) =>
          role.id !== guild.id &&
          !role.managed &&
          role.editable &&
          (role.permissions.bitfield & DANGEROUS) !== 0n,
      );
      if (!roles.size) return "No removable dangerous roles.";
      await member.roles.remove(
        [...roles.keys()],
        `Ultimate Guard ${event.action}`,
      );
      return `Removed ${roles.size} dangerous roles.`;
    },
    log: createSecurityLogDelivery(client, store, logger),
  };
}
