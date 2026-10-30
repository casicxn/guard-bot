import { randomUUID } from "node:crypto";
import {
  PermissionFlagsBits,
  type Client,
  type GuildChannelCreateOptions,
  type GuildChannelEditOptions,
  type GuildEditOptions,
} from "discord.js";
import type { Logger } from "pino";
import type { BackupService, Store } from "../contracts.js";
import { parseScope, validateSnapshot, type Snapshot } from "./schema.js";
import { findKnownGoodSnapshot } from "./known-good.js";
interface Operation {
  state: "pending" | "done";
  newId?: string;
  error?: string;
}
/** One process owns each store; services sharing that store share the same guild operation lock. */
const operationLocks = new WeakMap<Store, Set<string>>();
/** Automatic and manual structural recovery must never create competing replacements. */
export function acquireRecoveryOperation(
  store: Store,
  guildId: string,
): () => void {
  const active = operationLocks.get(store) ?? new Set<string>();
  operationLocks.set(store, active);
  if (active.has(guildId))
    throw new Error("A backup or restore is already running for this guild.");
  active.add(guildId);
  return () => {
    active.delete(guildId);
  };
}
/** Never repeat an uncertain create: the API may have applied it before the connection failed. */
export async function journaledCreate(
  store: Store,
  guildId: string,
  key: string,
  create: () => Promise<string>,
): Promise<string> {
  const old = store.get<Operation>(guildId, "restore_operations", key);
  if (old?.state === "done" && old.newId) return old.newId;
  if (old)
    throw new Error(
      `Uncertain previous creation ${key}; manual reconciliation required.`,
    );
  store.put<Operation>(guildId, "restore_operations", key, {
    state: "pending",
  });
  try {
    const newId = await create();
    store.put<Operation>(guildId, "restore_operations", key, {
      state: "done",
      newId,
    });
    return newId;
  } catch (error) {
    store.put<Operation>(guildId, "restore_operations", key, {
      state: "pending",
      error: error instanceof Error ? error.message : "Unknown failure",
    });
    throw error;
  }
}
export function createBackupService(
  client: Client,
  store: Store,
  logger: Logger,
): BackupService {
  const active = operationLocks.get(store) ?? new Set<string>();
  operationLocks.set(store, active);
  const load = (g: string, id: string) =>
    validateSnapshot(store.get(g, "backups", id), g);
  const mapped = (g: string, s: string, id: string) =>
    store.get<{ newId: string }>(g, "restore_mappings", `${s}:${id}`)?.newId ??
    id;
  const remember = (g: string, s: string, oldId: string, newId: string) =>
    store.put(g, "restore_mappings", `${s}:${oldId}`, { oldId, newId });
  async function fetchGuild(g: string) {
    const guild = await client.guilds.fetch({ guild: g, force: true });
    const [roles, channels, me] = await Promise.all([
      guild.roles.fetch(),
      guild.channels.fetch(),
      guild.members.fetchMe({ force: true }),
    ]);
    // Bulk fetches do not remove stale manager-cache entries; only their returned collections are authoritative.
    return { guild, roles, channels, me };
  }
  function acquire(guildId: string): void {
    if (active.has(guildId))
      throw new Error("A backup or restore is already running for this guild.");
    active.add(guildId);
  }
  return {
    async create(guildId) {
      acquire(guildId);
      try {
        const {
            guild,
            roles,
            channels: liveChannels,
          } = await fetchGuild(guildId),
          channels: Snapshot["channels"] = [],
          skippedChannels: string[] = [];
        for (const c of liveChannels.values()) {
          if (!c) continue;
          if (
            ![0, 2, 4, 5].includes(c.type) ||
            !("permissionOverwrites" in c)
          ) {
            skippedChannels.push(`${c.id}:${c.type}`);
            continue;
          }
          channels.push({
            id: c.id,
            name: c.name,
            type: c.type as 0 | 2 | 4 | 5,
            parentId: c.parentId,
            position: c.rawPosition,
            topic: "topic" in c ? c.topic : null,
            nsfw: "nsfw" in c ? c.nsfw : false,
            rateLimitPerUser:
              "rateLimitPerUser" in c ? (c.rateLimitPerUser ?? 0) : 0,
            bitrate: "bitrate" in c ? c.bitrate : 0,
            userLimit: "userLimit" in c ? c.userLimit : 0,
            overwrites: [...c.permissionOverwrites.cache.values()].map((o) => ({
              id: o.id,
              type: o.type,
              allow: o.allow.bitfield.toString(),
              deny: o.deny.bitfield.toString(),
            })),
          });
        }
        const snapshot = validateSnapshot(
          {
            version: 1,
            id: randomUUID(),
            guildId,
            createdAt: Date.now(),
            guild: {
              name: guild.name,
              verificationLevel: guild.verificationLevel,
              explicitContentFilter: guild.explicitContentFilter,
              defaultMessageNotifications: guild.defaultMessageNotifications,
            },
            roles: [...roles.values()].map((r) => ({
              id: r.id,
              name: r.name,
              permissions: r.permissions.bitfield.toString(),
              color: r.color,
              hoist: r.hoist,
              mentionable: r.mentionable,
              position: r.position,
              managed: r.managed,
            })),
            channels,
            skippedChannels,
          },
          guildId,
        );
        store.put(guildId, "backups", snapshot.id, snapshot);
        const retention = Math.max(
          1,
          Math.min(100, store.getConfig(guildId).backupRetention),
        );
        const pinned = findKnownGoodSnapshot(store, guildId)?.id;
        for (const old of store
          .list<Snapshot>(guildId, "backups")
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(retention))
          if (old.id !== pinned) store.delete(guildId, "backups", old.id);
        return { id: snapshot.id };
      } finally {
        active.delete(guildId);
      }
    },
    list(guildId) {
      return store
        .list<Snapshot>(guildId, "backups")
        .map((s) => validateSnapshot(s, guildId))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ id, createdAt }) => ({ id, createdAt }));
    },
    async preview(guildId, id, scope) {
      const selected = parseScope(scope),
        s = load(guildId, id),
        { roles, channels } = await fetchGuild(guildId);
      return `Scope: ${selected}. Roles: ${s.roles.filter((r) => !r.managed).length}; channels: ${s.channels.length}. Missing roles: ${s.roles.filter((r) => !r.managed && !roles.has(mapped(guildId, id, r.id))).length}; missing channels: ${s.channels.filter((c) => !channels.has(mapped(guildId, id, c.id))).length}. Existing supported objects and permissions will be updated; missing objects get NEW IDs. Nothing is deleted. Managed roles, member assignments, messages, icons, role positions, threads, stage/forum channels are not restored. Skipped channel types: ${s.skippedChannels.length}. Hierarchy restrictions may cause partial recovery.`;
    },
    async restore(guildId, id, scope) {
      const selected = parseScope(scope),
        s = load(guildId, id);
      acquire(guildId);
      const jobId = randomUUID(),
        results: string[] = [];
      try {
        store.put(guildId, "recovery_jobs", jobId, {
          id: jobId,
          snapshotId: id,
          scope: selected,
          state: "running",
          startedAt: Date.now(),
        });
        const { guild, roles, channels, me } = await fetchGuild(guildId),
          reason = `Ultimate Guard restore ${id}`;
        if (selected === "roles" || selected === "all") {
          if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
            throw new Error("Missing Manage Roles permission.");
          for (const role of [...s.roles].sort(
            (a, b) => a.position - b.position,
          )) {
            if (role.managed) {
              results.push(`Role ${role.id}: managed, skipped`);
              continue;
            }
            try {
              if (!me.permissions.has(BigInt(role.permissions)))
                throw new Error(
                  "Requested permissions exceed bot permissions.",
                );
              const data = {
                name: role.name,
                permissions: BigInt(role.permissions),
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                reason,
              };
              const current = roles.get(mapped(guildId, id, role.id));
              if (current) {
                if (current.id !== guildId && !current.editable)
                  throw new Error("Role is above bot hierarchy.");
                await current.edit(
                  current.id === guildId
                    ? { permissions: data.permissions, reason }
                    : data,
                );
              } else {
                const newId = await journaledCreate(
                  store,
                  guildId,
                  `role:${id}:${role.id}`,
                  async () => {
                    const created = await guild.roles.create(data);
                    roles.set(created.id, created);
                    return created.id;
                  },
                );
                if (!roles.has(newId))
                  throw new Error(
                    "Previously created role is missing; manual reconciliation required.",
                  );
                remember(guildId, id, role.id, newId);
              }
              results.push(`Role ${role.id}: restored`);
            } catch (error) {
              results.push(
                `Role ${role.id}: ${error instanceof Error ? error.message : "failed"}`,
              );
            }
          }
        }
        if (selected === "channels" || selected === "all") {
          if (
            !me.permissions.has(PermissionFlagsBits.ManageChannels) ||
            !me.permissions.has(PermissionFlagsBits.ManageRoles)
          )
            throw new Error(
              "Missing Manage Channels/Manage Roles permissions.",
            );
          for (const c of [...s.channels].sort(
            (a, b) =>
              Number(b.type === 4) - Number(a.type === 4) ||
              a.position - b.position,
          )) {
            try {
              const parent = c.parentId
                ? mapped(guildId, id, c.parentId)
                : null;
              if (parent && !channels.has(parent))
                throw new Error("Parent category missing.");
              const permissionOverwrites = c.overwrites.map((o) => {
                const target = o.type === 0 ? mapped(guildId, id, o.id) : o.id;
                if (o.type === 0 && !roles.has(target))
                  throw new Error(`Overwrite role ${o.id} missing.`);
                if (!me.permissions.has(BigInt(o.allow) | BigInt(o.deny)))
                  throw new Error(
                    "Overwrite permissions exceed bot permissions.",
                  );
                return {
                  id: target,
                  type: o.type,
                  allow: BigInt(o.allow),
                  deny: BigInt(o.deny),
                };
              });
              const data: GuildChannelCreateOptions = {
                name: c.name,
                type: c.type,
                parent,
                permissionOverwrites,
                position: c.position,
                reason,
                ...(c.type === 0 || c.type === 5
                  ? {
                      topic: c.topic ?? "",
                      nsfw: c.nsfw,
                      rateLimitPerUser: c.rateLimitPerUser,
                    }
                  : {}),
                ...(c.type === 2
                  ? {
                      bitrate: Math.min(c.bitrate, guild.maximumBitrate),
                      userLimit: c.userLimit,
                    }
                  : {}),
              };
              const current = channels.get(mapped(guildId, id, c.id));
              if (current) {
                if (current.type !== c.type || !("edit" in current))
                  throw new Error("Existing channel type differs.");
                const editData = { ...data };
                delete editData.type;
                await current.edit(editData as GuildChannelEditOptions);
              } else {
                const newId = await journaledCreate(
                  store,
                  guildId,
                  `channel:${id}:${c.id}`,
                  async () => {
                    const created = await guild.channels.create(data);
                    channels.set(created.id, created);
                    return created.id;
                  },
                );
                if (!channels.has(newId))
                  throw new Error(
                    "Previously created channel is missing; manual reconciliation required.",
                  );
                remember(guildId, id, c.id, newId);
              }
              results.push(`Channel ${c.id}: restored`);
            } catch (error) {
              results.push(
                `Channel ${c.id}: ${error instanceof Error ? error.message : "failed"}`,
              );
            }
          }
        }
        if (selected === "guild" || selected === "all") {
          if (!me.permissions.has(PermissionFlagsBits.ManageGuild))
            results.push("Guild: missing Manage Guild permission");
          else {
            await guild.edit({ ...s.guild, reason } as GuildEditOptions);
            results.push("Guild settings: restored");
          }
        }
        store.put(guildId, "recovery_jobs", jobId, {
          id: jobId,
          snapshotId: id,
          scope: selected,
          state: "finished",
          finishedAt: Date.now(),
          results,
        });
        return `Recovery job: ${jobId}\n${results.join("\n") || "No supported objects to restore."}`;
      } catch (error) {
        store.put(guildId, "recovery_jobs", jobId, {
          id: jobId,
          snapshotId: id,
          state: "failed",
          finishedAt: Date.now(),
          results,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        logger.error(
          { guildId, jobId },
          "Recovery failed; inspect persistent job",
        );
        throw error;
      } finally {
        active.delete(guildId);
      }
    },
  };
}
export { reverseAuditEvent } from "./reverse.js";
