import { PermissionFlagsBits, type Client } from "discord.js";
import { DANGEROUS_PERMISSIONS } from "../security/modules.js";
export interface RestartRole {
  id: string;
  name: string;
  permissions: string;
  position: number;
  managed: boolean;
  editable: boolean;
  botHeld: boolean;
  ownBotManaged: boolean;
}
export interface RestartGuild {
  id: string;
  botId: string;
  ownerId: string;
  manageRoles: boolean;
  botPermissions: string;
  botHighestPosition: number;
  roles: RestartRole[];
  overwriteRisks: string[];
}
export interface RestartAdapter {
  inspect(guildId: string): Promise<RestartGuild>;
  readRole(guildId: string, roleId: string): Promise<RestartRole | undefined>;
  setPermissions(
    guildId: string,
    roleId: string,
    permissions: string,
    reason: string,
    expectedPrevious?: string,
  ): Promise<void>;
  roleContainsContained(
    guildId: string,
    roleId: string,
    principalIds: string[],
  ): Promise<boolean>;
}
export function createDiscordRestartAdapter(client: Client): RestartAdapter {
  const guildFor = (guildId: string) =>
    client.guilds.fetch({ guild: guildId, force: true });
  return {
    async inspect(guildId) {
      if (!client.isReady() || !client.user)
        throw new Error("Discord client is not ready");
      const guild = await guildFor(guildId);
      const roles = await guild.roles.fetch();
      const me = await guild.members.fetchMe({ force: true });
      const channels = await guild.channels.fetch();
      const overwriteRisks: string[] = [];
      for (const channel of channels.values())
        if (channel && "permissionOverwrites" in channel) {
          for (const overwrite of channel.permissionOverwrites.cache.values()) {
            // Guild role lockdown cannot remove a permission explicitly granted by an overwrite.
            if ((overwrite.allow.bitfield & DANGEROUS_PERMISSIONS) !== 0n)
              overwriteRisks.push(`overwrite:${channel.id}:${overwrite.id}`);
          }
        }
      return {
        id: guild.id,
        botId: client.user.id,
        ownerId: guild.ownerId,
        manageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
        botPermissions: me.permissions.bitfield.toString(),
        botHighestPosition: me.roles.highest.position,
        roles: [...roles.values()].map((role) => ({
          id: role.id,
          name: role.name,
          permissions: role.permissions.bitfield.toString(),
          position: role.position,
          managed: role.managed,
          editable: role.editable,
          botHeld: me.roles.cache.has(role.id),
          ownBotManaged: role.tags?.botId === client.user!.id,
        })),
        overwriteRisks,
      };
    },
    async readRole(guildId, roleId) {
      const guild = await guildFor(guildId),
        me = await guild.members.fetchMe({ force: true });
      const role = await guild.roles.fetch(roleId, { force: true });
      if (!role) return undefined;
      return {
        id: role.id,
        name: role.name,
        permissions: role.permissions.bitfield.toString(),
        position: role.position,
        managed: role.managed,
        editable: role.editable,
        botHeld: me.roles.cache.has(role.id),
        ownBotManaged: role.tags?.botId === client.user?.id,
      };
    },
    async setPermissions(
      guildId,
      roleId,
      permissions,
      reason,
      expectedPrevious,
    ) {
      const guild = await guildFor(guildId),
        me = await guild.members.fetchMe({ force: true });
      const role = await guild.roles.fetch(roleId, { force: true });
      if (
        !role ||
        role.managed ||
        !role.editable ||
        !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
        role.position >= me.roles.highest.position ||
        me.roles.cache.has(role.id)
      )
        throw new Error("Role permission or hierarchy changed before mutation");
      if (
        expectedPrevious !== undefined &&
        role.permissions.bitfield.toString() !== expectedPrevious
      )
        throw new Error("Role permissions changed before mutation");
      if (!me.permissions.has(BigInt(permissions) & ~role.permissions.bitfield))
        throw new Error("Guard cannot grant the requested role permissions");
      await role.setPermissions(BigInt(permissions), reason);
    },
    async roleContainsContained(guildId, roleId, principalIds) {
      if (principalIds.length > 250)
        throw new Error(
          "Too many contained principals for bounded safe restoration",
        );
      const guild = await guildFor(guildId);
      for (const id of principalIds) {
        try {
          if (
            (
              await guild.members.fetch({ user: id, force: true })
            ).roles.cache.has(roleId)
          )
            return true;
        } catch (error) {
          if (!(
            error &&
            typeof error === "object" &&
            "code" in error &&
            Number(error.code) === 10007
          ))
            throw error;
        }
      }
      return false;
    },
  };
}
