import {
  AuditLogEvent,
  PermissionFlagsBits,
  Role,
  GuildMember,
  type Guild,
  type GuildAuditLogs,
  type GuildAuditLogsEntry,
} from "discord.js";
import type { SecurityEvent } from "../contracts.js";
import {
  actionForAudit,
  correlateAudit,
  dangerousPermissionGrant,
  DANGEROUS_PERMISSIONS,
} from "../security/index.js";

export async function normalizeAudit(
  entry: GuildAuditLogsEntry,
  guild: Guild,
): Promise<SecurityEvent | undefined> {
  let action = actionForAudit(entry.action);
  if (!action) return undefined;
  const changes = Object.fromEntries(
    entry.changes.map((change) => [
      change.key,
      { old: change.old, new: change.new },
    ]),
  );
  const permissions = entry.changes.find(
    (change) => change.key === "permissions",
  );
  let unresolved = false;
  let overwrite: SecurityEvent["overwrite"];
  if ([13, 14, 15].includes(entry.action)) {
    const extra = entry.extra;
    if (
      extra &&
      typeof extra === "object" &&
      "id" in extra &&
      typeof extra.id === "string" &&
      /^[1-9]\d{16,19}$/.test(extra.id)
    ) {
      if (extra instanceof Role) overwrite = { id: extra.id, type: 0 };
      else if (extra instanceof GuildMember)
        overwrite = { id: extra.id, type: 1 };
      else if ("type" in extra && String(extra.type) === "0")
        overwrite = { id: extra.id, type: 0 };
      else if ("type" in extra && String(extra.type) === "1")
        overwrite = { id: extra.id, type: 1 };
    }
  }
  if ((action === "role.update" || action === "role.create") && permissions) {
    const before = action === "role.create" ? "0" : String(permissions.old);
    const after = String(permissions.new);
    if (!/^\d+$/.test(before) || !/^\d+$/.test(after)) {
      action = "role.permissions";
      unresolved = true;
    } else if (dangerousPermissionGrant(before, after))
      action = "role.permissions";
  }
  if (entry.action === AuditLogEvent.MemberRoleUpdate) {
    const additions = entry.changes.find((change) => change.key === "$add");
    if (additions) {
      try {
        if (!Array.isArray(additions.new))
          throw new Error("Invalid role additions");
        for (const added of additions.new) {
          if (
            !added ||
            typeof added !== "object" ||
            !("id" in added) ||
            typeof added.id !== "string"
          )
            throw new Error("Invalid role ID");
          const role = await guild.roles.fetch(added.id, { force: true });
          if (!role) throw new Error("Role unavailable");
          if ((role.permissions.bitfield & DANGEROUS_PERMISSIONS) !== 0n)
            action = "member.permissions";
        }
      } catch {
        action = "member.permissions";
        unresolved = true;
      }
    }
  }
  return {
    id: entry.id,
    guildId: guild.id,
    action,
    targetId: entry.targetId,
    executorId: entry.executorId,
    timestamp: entry.createdTimestamp,
    source: unresolved ? "gateway" : "audit",
    auditAction: entry.action,
    changes,
    ...(overwrite ? { overwrite } : {}),
  };
}

/** Rare fallback only: share concurrent fetches, retry twice, reject ambiguous action/target matches. */
export class AuditFallback {
  private readonly batches = new Map<
    string,
    { expiresAt: number; promise: Promise<GuildAuditLogs> }
  >();
  async resolve(
    guild: Guild,
    event: SecurityEvent,
  ): Promise<SecurityEvent | undefined> {
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog))
      return undefined;
    let latest: GuildAuditLogs | undefined;
    const matched = await correlateAudit(
      event,
      async () => {
        const now = Date.now();
        for (const [id, batch] of this.batches)
          if (batch.expiresAt <= now) this.batches.delete(id);
        let batch = this.batches.get(guild.id);
        if (!batch) {
          batch = {
            expiresAt: now + 250,
            promise: guild.fetchAuditLogs({ limit: 25 }),
          };
          this.batches.set(guild.id, batch);
        }
        latest = await batch.promise;
        return [...latest.entries.values()].flatMap((entry) => {
          const action = actionForAudit(entry.action);
          return action
            ? [
                {
                  id: entry.id,
                  guildId: guild.id,
                  action,
                  targetId: entry.targetId,
                  executorId: entry.executorId,
                  timestamp: entry.createdTimestamp,
                  source: "audit" as const,
                  auditAction: entry.action,
                },
              ]
            : [];
        });
      },
      { attempts: 2, delayMs: 500 },
    );
    const entry = matched && latest?.entries.get(matched.id);
    return entry ? normalizeAudit(entry, guild) : undefined;
  }
  clear(): void {
    this.batches.clear();
  }
}
