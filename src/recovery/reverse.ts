import {
  AuditLogEvent,
  PermissionFlagsBits,
  type Client,
  type GuildEditOptions,
  type RoleEditOptions,
} from "discord.js";
import { z } from "zod";
import type { SecurityEvent, Store } from "../contracts.js";
const changeSchema = z.object({ old: z.unknown(), new: z.unknown() });
const integer = z.number().int();
const permission = z.string().regex(/^\d{1,30}$/);
/** Revert only exact audited fields when live state still matches the audited new state. */
export async function reverseAuditEvent(
  client: Client,
  event: SecurityEvent,
  store: Store,
  canContinue?: () => Promise<boolean>,
): Promise<string> {
  if (
    event.source !== "audit" ||
    !event.targetId ||
    !event.executorId ||
    Math.abs(Date.now() - event.timestamp) > 30_000
  )
    throw new Error("Reverse requires a recent, attributed audit event.");
  const changes = event.changes;
  if (!changes || Object.keys(changes).length === 0)
    throw new Error("No reliable previous state for reversal.");
  const guild = await client.guilds.fetch({
      guild: event.guildId,
      force: true,
    }),
    me = await guild.members.fetchMe({ force: true });
  if (
    event.executorId === guild.ownerId ||
    event.executorId === client.user?.id
  )
    throw new Error("Protected principal cannot be reversed.");
  let apply: () => Promise<unknown>;
  if (event.auditAction === AuditLogEvent.RoleUpdate) {
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
      throw new Error("Missing Manage Roles permission.");
    const role = await guild.roles.fetch(event.targetId, { force: true });
    if (!role || role.managed || (role.id !== guild.id && !role.editable))
      throw new Error("Role is missing or outside bot hierarchy.");
    const data: RoleEditOptions = {
      reason: `Ultimate Guard reverse ${event.id}`,
    };
    for (const [key, value] of Object.entries(changes)) {
      const change = changeSchema.parse(value);
      if (key === "permissions") {
        const old = BigInt(permission.parse(change.old)),
          next = BigInt(permission.parse(change.new));
        if (role.permissions.bitfield !== next)
          throw new Error(
            "Role changed since audited action; reverse refused.",
          );
        if (!me.permissions.has(old))
          throw new Error("Old permissions exceed bot permissions.");
        data.permissions = old;
      } else if (key === "name" && role.id !== guild.id) {
        const schema = z.string().min(1).max(100);
        const old = schema.parse(change.old),
          next = schema.parse(change.new);
        if (role.name !== next)
          throw new Error("Role name changed since audited action.");
        data.name = old;
      } else
        throw new Error(
          `Role field ${key} cannot safely be reversed automatically.`,
        );
    }
    apply = () => role.edit(data);
  } else if (
    event.auditAction === AuditLogEvent.GuildUpdate &&
    event.targetId === guild.id
  ) {
    if (!me.permissions.has(PermissionFlagsBits.ManageGuild))
      throw new Error("Missing Manage Guild permission.");
    const data: GuildEditOptions = {
      reason: `Ultimate Guard reverse ${event.id}`,
    };
    for (const [key, value] of Object.entries(changes)) {
      const change = changeSchema.parse(value);
      if (key === "name") {
        const schema = z.string().min(2).max(100),
          old = schema.parse(change.old),
          next = schema.parse(change.new);
        if (guild.name !== next)
          throw new Error("Guild name changed since audited action.");
        data.name = old;
      } else if (key === "verification_level") {
        const schema = integer.min(0).max(4),
          old = schema.parse(change.old),
          next = schema.parse(change.new);
        if (guild.verificationLevel !== next)
          throw new Error("Guild verification changed since audited action.");
        data.verificationLevel = old;
      } else if (key === "explicit_content_filter") {
        const schema = integer.min(0).max(2),
          old = schema.parse(change.old),
          next = schema.parse(change.new);
        if (guild.explicitContentFilter !== next)
          throw new Error("Guild content filter changed since audited action.");
        data.explicitContentFilter = old;
      } else if (key === "default_message_notifications") {
        const schema = integer.min(0).max(1),
          old = schema.parse(change.old),
          next = schema.parse(change.new);
        if (guild.defaultMessageNotifications !== next)
          throw new Error("Guild notifications changed since audited action.");
        data.defaultMessageNotifications = old;
      } else
        throw new Error(
          `Guild field ${key} cannot safely be reversed automatically.`,
        );
    }
    apply = () => guild.edit(data);
  } else
    throw new Error(
      "Automatic reverse supports only audited role name/permissions and guild name/security/notification updates.",
    );
  if (canContinue && !(await canContinue()))
    throw new Error(
      "Protection stopped or executor became exempt before reversal.",
    );
  const key = `reverse:${event.id}`;
  if (!store.claim(event.guildId, key))
    return "Reverse was already attempted; inspect incident before retrying.";
  store.put(event.guildId, "restore_operations", key, {
    state: "pending",
    eventId: event.id,
    createdAt: Date.now(),
  });
  try {
    await apply();
    store.put(event.guildId, "restore_operations", key, {
      state: "done",
      eventId: event.id,
      createdAt: Date.now(),
    });
    return "Audited fields reversed after exact live-state validation.";
  } catch (error) {
    store.put(event.guildId, "restore_operations", key, {
      state: "uncertain",
      eventId: event.id,
      createdAt: Date.now(),
    });
    throw error;
  }
}
