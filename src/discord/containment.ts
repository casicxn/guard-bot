import {
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Role,
} from "discord.js";
import type { Logger } from "pino";
import type { SecurityEvent, Store, WhitelistEntry } from "../contracts.js";
import type { ContainmentResult } from "../security/antinuke-contracts.js";
import {
  DANGEROUS_PERMISSIONS,
  isWhitelisted,
  MODULES,
} from "../security/index.js";

/** Role removal is idempotent; fresh membership is inspected before each operation. */
export function createContainment(
  client: Client,
  store: Store,
  logger: Logger,
  botOwnerId?: string,
): (event: SecurityEvent) => Promise<ContainmentResult> {
  const queues = new Map<string, Promise<ContainmentResult>>();
  const result = (
    status: ContainmentResult["status"],
    reason: string,
    removedRoleIds: string[] = [],
    remainingRoleIds: string[] = [],
    remainingPermissions = "unknown",
  ): ContainmentResult => ({
    status,
    reason,
    removedRoleIds,
    remainingRoleIds,
    remainingPermissions,
  });
  const exempt = (
    guild: Guild,
    member: GuildMember,
    event: SecurityEvent,
  ): boolean => {
    if (
      event.executorId === guild.ownerId ||
      event.executorId === client.user?.id ||
      event.executorId === botOwnerId
    )
      return true;
    return isWhitelisted(
      store.list<WhitelistEntry>(guild.id, "whitelist"),
      event,
      {
        ownerId: guild.ownerId,
        selfId: client.user?.id ?? "",
        roleIds: [...member.roles.cache.keys()],
        isBot: member.user.bot,
        botOwnerId,
      },
      Date.now(),
    );
  };
  const enabled = (guildId: string, event: SecurityEvent): boolean => {
    const config = store.getConfig(guildId);
    return (
      config.mode === "protect" &&
      config.zeroTolerance === true &&
      (config.protectionActivatedAt === undefined ||
        event.timestamp >= config.protectionActivatedAt)
    );
  };
  const recent = (event: SecurityEvent): boolean =>
    Date.now() - event.timestamp <= 60000 &&
    Date.now() - event.timestamp >= -5000;
  async function contain(event: SecurityEvent): Promise<ContainmentResult> {
    const module = MODULES.find((module) => module.id === event.action);
    if (
      !module?.administrative ||
      !event.id ||
      !event.executorId ||
      !event.targetId ||
      event.source !== "audit" ||
      event.auditAction === undefined ||
      !module.auditActions.includes(event.auditAction) ||
      !Number.isFinite(event.timestamp) ||
      Date.now() - event.timestamp > 60000 ||
      Date.now() - event.timestamp < -5000
    )
      return result(
        "failed",
        "Recent confirmed administrative attribution is required",
      );
    const guild = await client.guilds.fetch({
      guild: event.guildId,
      force: true,
    });
    if (guild.id !== event.guildId)
      return result("failed", "Guild identity mismatch");
    if (
      event.executorId === guild.ownerId ||
      event.executorId === client.user?.id ||
      event.executorId === botOwnerId
    )
      return result(
        "exempt",
        "Protected owner or bot self-action",
        [],
        [],
        "0",
      );
    const removed: string[] = [];
    try {
      let roles = await guild.roles.fetch();
      let member = await guild.members.fetch({
        user: event.executorId,
        force: true,
      });
      const me = await guild.members.fetchMe({ force: true });
      if (!enabled(guild.id, event) || exempt(guild, member, event))
        return result(
          "exempt",
          "Protection mode or executor authorization changed",
          [],
          [],
          "0",
        );
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
        return result(
          "failed",
          "Missing Manage Roles permission",
          [],
          dangerousIds(member, roles),
          String(member.permissions.bitfield & DANGEROUS_PERMISSIONS),
        );
      if (me.roles.highest.comparePositionTo(member.roles.highest) <= 0)
        return result(
          "failed",
          "Executor is at or above bot role hierarchy",
          [],
          dangerousIds(member, roles),
          String(member.permissions.bitfield & DANGEROUS_PERMISSIONS),
        );
      const access = await channelAccess(guild, member);
      const candidates = [
        ...new Set([...dangerousIds(member, roles), ...access.roles]),
      ].filter((id) => {
        const role = roles.get(id);
        return (
          !!role &&
          role.id !== guild.id &&
          !role.managed &&
          role.editable &&
          me.roles.highest.comparePositionTo(role) > 0
        );
      });
      for (const roleId of candidates) {
        member = await guild.members.fetch({
          user: event.executorId,
          force: true,
        });
        if (!enabled(guild.id, event) || exempt(guild, member, event))
          return result(
            "exempt",
            "Protection mode or executor authorization changed",
            removed,
          );
        if (!member.roles.cache.has(roleId)) continue;
        const freshRole = await guild.roles.fetch(roleId, { force: true });
        const freshMe = await guild.members.fetchMe({ force: true });
        if (
          !freshRole ||
          freshRole.managed ||
          !freshRole.editable ||
          !freshMe.permissions.has(PermissionFlagsBits.ManageRoles) ||
          freshMe.roles.highest.comparePositionTo(freshRole) <= 0 ||
          freshMe.roles.highest.comparePositionTo(member.roles.highest) <= 0
        )
          continue;
        // Removing Administrator can expose a deny that makes another role's override harmless.
        // Never rely on the initial effective permission expansion for later removals.
        if (!(freshRole.permissions.bitfield & DANGEROUS_PERMISSIONS)) {
          const currentAccess = await channelAccess(guild, member);
          if (!currentAccess.roles.has(roleId)) continue;
        }
        if (
          !recent(event) ||
          !enabled(guild.id, event) ||
          exempt(guild, member, event)
        )
          return result(
            "exempt",
            "Protection mode, event age or executor authorization changed",
            removed,
          );
        const key = `${event.executorId}:${event.id}:${roleId}`;
        if (store.get(guild.id, "containment_operations", key)) continue;
        // Persist intent first. Unknown API outcomes are not blindly repeated for the same incident.
        store.put(guild.id, "containment_operations", key, {
          state: "pending",
          executorId: event.executorId,
          roleId,
          eventId: event.id,
          updatedAt: Date.now(),
        });
        await member.roles.remove(
          roleId,
          `Ultimate Guard containment ${event.id}`,
        );
        store.put(guild.id, "containment_operations", key, {
          state: "done",
          executorId: event.executorId,
          roleId,
          eventId: event.id,
          updatedAt: Date.now(),
        });
        removed.push(roleId);
      }
      roles = await guild.roles.fetch();
      member = await guild.members.fetch({
        user: event.executorId,
        force: true,
      });
      const finalAccess = await channelAccess(guild, member);
      const remaining = [
        ...new Set([...dangerousIds(member, roles), ...finalAccess.roles]),
      ];
      const permissions =
        (member.permissions.bitfield | finalAccess.permissions) &
        DANGEROUS_PERMISSIONS;
      const incomplete =
        remaining.length > 0 || permissions !== 0n || !finalAccess.available;
      return result(
        incomplete ? "partial" : "contained",
        incomplete
          ? "Dangerous permissions remain or channel access could not be fully verified; inspect unmanageable roles, everyone and member overrides"
          : "Manageable dangerous roles removed; no dangerous guild/channel permissions remain",
        removed,
        remaining,
        finalAccess.available ? String(permissions) : "unknown",
      );
    } catch (error) {
      logger.warn(
        {
          err: error,
          guildId: event.guildId,
          executorId: event.executorId,
          eventId: event.id,
        },
        "Containment failed or incomplete",
      );
      return result(
        removed.length ? "partial" : "failed",
        error instanceof Error
          ? error.message
          : "Containment dependency failed",
        removed,
      );
    }
  }
  function dangerousIds(
    member: GuildMember,
    roles: Map<string, Role>,
  ): string[] {
    return [...member.roles.cache.keys()].filter((id) => {
      const role = roles.get(id);
      return !!role && !!(role.permissions.bitfield & DANGEROUS_PERMISSIONS);
    });
  }
  async function channelAccess(
    guild: Guild,
    member: GuildMember,
  ): Promise<{ roles: Set<string>; permissions: bigint; available: boolean }> {
    const output = {
      roles: new Set<string>(),
      permissions: 0n,
      available: true,
    };
    try {
      const channels = await guild.channels.fetch();
      for (const channel of channels.values()) {
        if (!channel || !("permissionOverwrites" in channel)) continue;
        const permissions = channel.permissionsFor(member);
        if (!permissions) {
          output.available = false;
          continue;
        }
        const effectiveDanger = permissions.bitfield & DANGEROUS_PERMISSIONS;
        output.permissions |= effectiveDanger;
        for (const overwrite of channel.permissionOverwrites.cache.values()) {
          if (
            overwrite.type === 0 &&
            member.roles.cache.has(overwrite.id) &&
            overwrite.allow.bitfield & effectiveDanger
          )
            output.roles.add(overwrite.id);
        }
      }
    } catch {
      output.available = false;
    }
    return output;
  }
  return (event) => {
    const key = `${event.guildId}:${event.executorId}`;
    const task = (queues.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => contain(event));
    queues.set(key, task);
    void task
      .finally(() => {
        if (queues.get(key) === task) queues.delete(key);
      })
      .catch(() => undefined);
    return task;
  };
}
