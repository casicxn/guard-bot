import {
  AuditLogEvent,
  ChannelType,
  PermissionFlagsBits,
  Routes,
  Role,
  GuildMember,
  type Client,
  type GuildChannelCreateOptions,
  type GuildChannelEditOptions,
  type RoleEditOptions,
} from "discord.js";
import { z } from "zod";
import type { Logger } from "pino";
import type { SecurityEvent, Store } from "../contracts.js";
import type { RollbackResult } from "../security/antinuke-contracts.js";
import { DANGEROUS_PERMISSIONS } from "../security/modules.js";
import { journaledCreate, acquireRecoveryOperation } from "./index.js";
import { findKnownGoodSnapshot } from "./known-good.js";
import { reverseAuditEvent } from "./reverse.js";

type Guard = () => Promise<boolean>;
interface Attempt {
  version: 1;
  eventId: string;
  targetId: string | null;
  strategy: string;
  state: "pending" | "done";
  startedAt: number;
  finishedAt?: number;
  phase?: string;
  outcome?: RollbackResult;
}
interface BanHistory {
  version: 1;
  kind: "ban";
  guildId: string;
  targetId: string;
  exists: boolean;
  observedAt: number;
  reason?: string;
}
interface BanBaseline {
  guildId: string;
  observedAt: number;
  complete: true;
  bannedIds: string[];
}
interface Membership {
  guildId: string;
  roleId: string;
  observedAt: number;
  complete: true;
  memberIds: string[];
}
const snowflake = z.string().regex(/^[1-9]\d{16,19}$/);
const pair = z.object({
  old: z.unknown().optional(),
  new: z.unknown().optional(),
});
const text = z.string().min(1).max(100);
const number = z.number().int();
const permission = z.string().regex(/^\d{1,30}$/);
const code = (error: unknown): number | undefined =>
  error && typeof error === "object" && "code" in error
    ? Number(error.code)
    : undefined;
const creationTime = (id: string): number =>
  Number(BigInt(snowflake.parse(id)) >> 22n) + 1420070400000;
const outcome = (
  status: RollbackResult["status"],
  strategy: string,
  result: string,
  newId?: string,
): RollbackResult => ({
  status,
  strategy,
  result,
  ...(newId ? { newId } : {}),
});
class StopRollback extends Error {}

/** Every adapter is target-specific. Uncertain external effects are journaled, never blindly retried. */
export function createRollbackEngine(
  client: Client,
  store: Store,
  logger: Logger,
) {
  const quarantined = (guildId: string, memberId: string): boolean => {
    const record = store.get<{ status?: string }>(
      guildId,
      "containment_records",
      memberId,
    );
    return Boolean(record && record.status !== "exempt");
  };
  const running = new Map<string, Promise<RollbackResult>>();
  const execute = async (
    event: SecurityEvent,
    canContinue: Guard,
  ): Promise<RollbackResult> => {
    let strategy = "unsupported";
    const existing = store.get<Attempt>(
      event.guildId,
      "rollback_attempts",
      event.id,
    );
    if (existing)
      return existing.state === "done" && existing.outcome
        ? existing.outcome
        : outcome(
            "uncertain",
            existing.strategy,
            "A prior rollback may have reached Discord; manual reconciliation required.",
          );
    let sent = false;
    let effectsCompleted = 0;
    let releaseOperation: (() => void) | undefined;
    const attempt: Attempt = {
      version: 1,
      eventId: event.id,
      targetId: event.targetId,
      strategy,
      state: "pending",
      startedAt: Date.now(),
    };
    const persist = () =>
      store.put(event.guildId, "rollback_attempts", event.id, attempt);
    persist();
    const result = async (): Promise<RollbackResult> => {
      if (
        event.source !== "audit" ||
        !event.targetId ||
        !event.executorId ||
        event.auditAction === undefined ||
        !Number.isFinite(event.timestamp) ||
        Date.now() - event.timestamp > 60_000 ||
        Date.now() - event.timestamp < -5000
      )
        return outcome(
          "skipped",
          strategy,
          "Recent confirmed audit attribution is required.",
        );
      if (!(await canContinue()))
        return outcome(
          "skipped",
          strategy,
          "Protection stopped or executor became exempt before rollback.",
        );
      const guild = await client.guilds.fetch({
        guild: event.guildId,
        force: true,
      });
      if (
        guild.id !== event.guildId ||
        event.executorId === guild.ownerId ||
        event.executorId === client.user?.id
      )
        return outcome(
          "skipped",
          strategy,
          "Protected principal cannot be reversed.",
        );
      const me = await guild.members.fetchMe({ force: true });
      if (!me.permissions.has(PermissionFlagsBits.ViewAuditLog))
        return outcome(
          "failed",
          strategy,
          "View Audit Log permission is unavailable.",
        );
      const audit = await guild.fetchAuditLogs({ limit: 100 });
      const exact = audit.entries.get(event.id);
      if (
        !exact ||
        exact.id !== event.id ||
        exact.action !== event.auditAction ||
        exact.executorId !== event.executorId ||
        exact.targetId !== event.targetId ||
        Math.abs(exact.createdTimestamp - event.timestamp) > 1000
      )
        return outcome(
          "skipped",
          strategy,
          "The exact executor, target, action and audit entry could not be revalidated.",
        );
      // Revalidate across action types: a later authorized edit can supersede an earlier create/delete/update.
      const later = [...audit.entries.values()].some(
        (entry) =>
          entry.targetId === event.targetId &&
          entry.id !== event.id &&
          (entry.createdTimestamp > event.timestamp ||
            (entry.createdTimestamp === event.timestamp &&
              BigInt(entry.id) > BigInt(event.id))),
      );
      if (later)
        return outcome(
          "skipped",
          strategy,
          "A newer audit action exists for this target; rollback refused.",
        );
      const reason = `Ultimate Guard anti-nuke rollback ${event.id}`;
      const effect = async <T>(
        phase: string,
        apply: () => Promise<T>,
      ): Promise<T> => {
        if (!(await canContinue()))
          throw new StopRollback(
            "Protection stopped or executor became exempt before the next effect.",
          );
        attempt.strategy = strategy;
        attempt.phase = phase;
        persist();
        sent = true;
        const applied = await apply();
        effectsCompleted++;
        return applied;
      };
      const requirePermission = (bits: bigint | bigint[]) => {
        if (!me.permissions.has(bits))
          throw new Error(
            "Required Discord rollback permissions are unavailable.",
          );
      };
      const target = event.targetId;
      if (
        event.auditAction === AuditLogEvent.ChannelDelete ||
        event.auditAction === AuditLogEvent.RoleDelete
      )
        releaseOperation = acquireRecoveryOperation(store, event.guildId);
      if (event.auditAction === AuditLogEvent.ChannelCreate) {
        strategy = "delete-created";
        requirePermission(PermissionFlagsBits.ManageChannels);
        const channel = await guild.channels.fetch(target, { force: true });
        if (!channel)
          return outcome(
            "succeeded",
            strategy,
            "Unauthorized channel is already absent.",
          );
        if (
          channel.guildId !== guild.id ||
          channel.isThread() ||
          !("createdTimestamp" in channel) ||
          Math.abs(channel.createdTimestamp - event.timestamp) > 5000 ||
          !channel.deletable
        )
          return outcome(
            "skipped",
            strategy,
            "Created channel identity, timestamp or permissions do not permit safe deletion.",
          );
        await effect("delete-created-channel", async () => {
          await channel.delete(reason);
        });
        return outcome("succeeded", strategy, "Unauthorized channel deleted.");
      }
      if (event.auditAction === AuditLogEvent.RoleCreate) {
        strategy = "delete-created";
        requirePermission(PermissionFlagsBits.ManageRoles);
        const role = await guild.roles.fetch(target, { force: true });
        if (!role)
          return outcome(
            "succeeded",
            strategy,
            "Unauthorized role is already absent.",
          );
        if (
          role.guild.id !== guild.id ||
          role.id === guild.id ||
          role.managed ||
          !role.editable ||
          Math.abs(role.createdTimestamp - event.timestamp) > 5000
        )
          return outcome(
            "skipped",
            strategy,
            "Created role identity, timestamp or hierarchy does not permit safe deletion.",
          );
        await effect("delete-created-role", () => role.delete(reason));
        return outcome("succeeded", strategy, "Unauthorized role deleted.");
      }
      if (
        event.auditAction === AuditLogEvent.ChannelDelete ||
        event.auditAction === AuditLogEvent.RoleDelete
      ) {
        strategy = "snapshot-recreate";
        const snapshot = findKnownGoodSnapshot(
          store,
          guild.id,
          event.timestamp,
        );
        if (!snapshot)
          return outcome(
            "unsupported",
            strategy,
            "No trustworthy pre-incident structural snapshot exists.",
          );
        const mapped = (id: string) =>
          store.get<{ newId: string }>(
            guild.id,
            "restore_mappings",
            `${snapshot.id}:${id}`,
          )?.newId ?? id;
        const remember = (newId: string) =>
          store.put(guild.id, "restore_mappings", `${snapshot.id}:${target}`, {
            oldId: target,
            newId,
          });
        if (event.auditAction === AuditLogEvent.ChannelDelete) {
          requirePermission([
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
          ]);
          const saved = snapshot.channels.find(
            (channel) => channel.id === target,
          );
          if (!saved)
            return outcome(
              "unsupported",
              strategy,
              "Deleted channel is absent from the trustworthy snapshot.",
            );
          const channels = await guild.channels.fetch();
          if (channels.has(mapped(target)))
            return outcome(
              "skipped",
              strategy,
              "A live channel already occupies the original or replacement identity.",
            );
          const roles = await guild.roles.fetch();
          const parent = saved.parentId ? mapped(saved.parentId) : null;
          const parentChannel = parent ? channels.get(parent) : null;
          if (
            parent &&
            (!parentChannel || parentChannel.type !== ChannelType.GuildCategory)
          )
            return outcome(
              "failed",
              strategy,
              "The saved parent category is missing; no unsafe unparented channel was created.",
            );
          const overwrites = saved.overwrites.map((overwrite) => {
            const id =
              overwrite.type === 0 ? mapped(overwrite.id) : overwrite.id;
            if (overwrite.type === 0 && !roles.has(id))
              throw new Error(
                "A saved overwrite role is missing; channel recovery refused.",
              );
            if (
              !me.permissions.has(
                BigInt(overwrite.allow) | BigInt(overwrite.deny),
              )
            )
              throw new Error(
                "Saved overwrite permissions exceed the bot permissions.",
              );
            return {
              id,
              type: overwrite.type,
              allow: BigInt(overwrite.allow),
              deny: BigInt(overwrite.deny),
            };
          });
          const data: GuildChannelCreateOptions = {
            name: saved.name,
            type: saved.type,
            parent,
            position: saved.position,
            permissionOverwrites: overwrites,
            reason,
            ...(saved.type === 0 || saved.type === 5
              ? {
                  topic: saved.topic ?? "",
                  nsfw: saved.nsfw,
                  rateLimitPerUser: saved.rateLimitPerUser,
                }
              : {}),
            ...(saved.type === 2
              ? {
                  bitrate: Math.min(saved.bitrate, guild.maximumBitrate),
                  userLimit: saved.userLimit,
                }
              : {}),
          };
          const newId = await journaledCreate(
            store,
            guild.id,
            `anti-channel:${event.id}:${target}`,
            () =>
              effect(
                "recreate-channel",
                async () => (await guild.channels.create(data)).id,
              ),
          );
          remember(newId);
          return outcome(
            "partial",
            strategy,
            "Channel structure recreated with a new ID. Message history and live membership cannot be restored; child-category links may need review.",
            newId,
          );
        }
        requirePermission(PermissionFlagsBits.ManageRoles);
        const saved = snapshot.roles.find((role) => role.id === target);
        if (!saved || saved.managed || saved.id === guild.id)
          return outcome(
            "unsupported",
            strategy,
            "No recreatable deleted role exists in the trustworthy snapshot.",
          );
        if (!me.permissions.has(BigInt(saved.permissions)))
          return outcome(
            "failed",
            strategy,
            "Saved role permissions exceed the bot permissions.",
          );
        const roles = await guild.roles.fetch();
        if (roles.has(mapped(target)))
          return outcome(
            "skipped",
            strategy,
            "A live role already occupies the original or replacement identity.",
          );
        const newId = await journaledCreate(
          store,
          guild.id,
          `anti-role:${event.id}:${target}`,
          () =>
            effect(
              "recreate-role",
              async () =>
                (
                  await guild.roles.create({
                    name: saved.name,
                    color: saved.color,
                    permissions: BigInt(saved.permissions),
                    hoist: saved.hoist,
                    mentionable: saved.mentionable,
                    reason,
                  })
                ).id,
            ),
        );
        remember(newId);
        const issues: string[] = ["Deleted role received a new ID."];
        let partial = false;
        const replacement = await guild.roles.fetch(newId, { force: true });
        if (!replacement || !replacement.editable)
          return outcome(
            "partial",
            strategy,
            "Role recreated but replacement hierarchy cannot be validated for positioning, assignments or overwrite remapping.",
            newId,
          );
        if (saved.position >= me.roles.highest.position) {
          partial = true;
          issues.push("Original role position exceeds bot hierarchy.");
        } else
          await effect("position-role", () =>
            replacement.setPosition(saved.position, { reason }),
          ).catch((error) => {
            if (error instanceof StopRollback) throw error;
            partial = true;
            issues.push(
              `Role position unavailable: ${error instanceof Error ? error.message : "failed"}`,
            );
          });
        const membership = store.get<Membership>(
          guild.id,
          "trusted_history",
          `members:${target}`,
        );
        if (
          membership &&
          membership.guildId === guild.id &&
          membership.roleId === target &&
          membership.complete === true &&
          Number.isFinite(membership.observedAt) &&
          membership.observedAt < event.timestamp &&
          Array.isArray(membership.memberIds)
        ) {
          for (const id of [...new Set(membership.memberIds)].slice(0, 250)) {
            if (
              !snowflake.safeParse(id).success ||
              id === event.executorId ||
              quarantined(guild.id, id)
            ) {
              partial = true;
              issues.push("Attacker or invalid member was not reassigned.");
              continue;
            }
            try {
              const member = await guild.members.fetch({
                user: id,
                force: true,
              });
              if (
                member.id === guild.ownerId ||
                me.roles.highest.comparePositionTo(member.roles.highest) <= 0
              ) {
                partial = true;
                issues.push(`Member ${id} is outside bot hierarchy.`);
                continue;
              }
              if (!member.roles.cache.has(newId))
                await effect("reassign-member-role", () => {
                  if (quarantined(guild.id, id))
                    throw new StopRollback(
                      "A contained executor must not be granted replacement roles.",
                    );
                  return member.roles.add(newId, reason);
                });
            } catch (error) {
              if (error instanceof StopRollback) throw error;
              partial = true;
              issues.push(
                `Member ${id} could not be reassigned: ${error instanceof Error ? error.message : "failed"}`,
              );
            }
          }
          if (membership.memberIds.length > 250) {
            partial = true;
            issues.push(
              "Membership recovery reached its 250-member safety bound.",
            );
          }
        } else {
          partial = true;
          issues.push(
            "No complete trustworthy membership snapshot exists; member assignments were not invented.",
          );
        }
        if (me.permissions.has(PermissionFlagsBits.ManageChannels)) {
          for (const channelState of snapshot.channels) {
            const savedOverwrite = channelState.overwrites.find(
              (overwrite) => overwrite.type === 0 && overwrite.id === target,
            );
            if (!savedOverwrite) continue;
            try {
              const channel = await guild.channels.fetch(
                mapped(channelState.id),
                { force: true },
              );
              if (
                !channel ||
                !("permissionOverwrites" in channel) ||
                channel.isThread()
              ) {
                partial = true;
                issues.push(
                  `Channel ${channelState.id} unavailable for overwrite remapping.`,
                );
                continue;
              }
              if (channel.permissionOverwrites.cache.has(newId)) {
                partial = true;
                issues.push(
                  `Replacement overwrite already exists on ${channel.id}; preserved.`,
                );
                continue;
              }
              const allow = BigInt(savedOverwrite.allow),
                deny = BigInt(savedOverwrite.deny);
              const supportedMask = Object.values(PermissionFlagsBits).reduce(
                (mask, bit) => mask | bit,
                0n,
              );
              if (((allow | deny) & ~supportedMask) !== 0n) {
                partial = true;
                issues.push(
                  "Saved overwrite contains unknown permission bits; preserved for manual recovery.",
                );
                continue;
              }
              if (!me.permissions.has(allow | deny)) {
                partial = true;
                issues.push("Saved overwrite exceeds bot permissions.");
                continue;
              }
              await effect("remap-role-overwrite", () =>
                channel.permissionOverwrites.create(
                  newId,
                  {
                    ...Object.fromEntries(
                      Object.entries(PermissionFlagsBits)
                        .filter(([, bit]) => (allow & bit) !== 0n)
                        .map(([key]) => [key, true]),
                    ),
                    ...Object.fromEntries(
                      Object.entries(PermissionFlagsBits)
                        .filter(([, bit]) => (deny & bit) !== 0n)
                        .map(([key]) => [key, false]),
                    ),
                  },
                  { reason, type: 0 },
                ),
              );
            } catch (error) {
              if (error instanceof StopRollback) throw error;
              partial = true;
              issues.push(
                `Overwrite recovery failed: ${error instanceof Error ? error.message : "failed"}`,
              );
            }
          }
        } else if (
          snapshot.channels.some((channel) =>
            channel.overwrites.some(
              (overwrite) => overwrite.id === target && overwrite.type === 0,
            ),
          )
        ) {
          partial = true;
          issues.push(
            "Missing Manage Channels permission for overwrite remapping.",
          );
        }
        return outcome(
          partial ? "partial" : "succeeded",
          strategy,
          issues.join("\n"),
          newId,
        );
      }
      if (
        [
          AuditLogEvent.ChannelOverwriteCreate,
          AuditLogEvent.ChannelOverwriteUpdate,
          AuditLogEvent.ChannelOverwriteDelete,
        ].includes(event.auditAction)
      ) {
        strategy = "audited-fields";
        requirePermission(PermissionFlagsBits.ManageRoles);
        const principal = event.overwrite;
        const extra: unknown = exact.extra;
        const extraId =
          extra &&
          typeof extra === "object" &&
          "id" in extra &&
          typeof extra.id === "string"
            ? extra.id
            : undefined;
        const extraType =
          extra instanceof Role
            ? 0
            : extra instanceof GuildMember
              ? 1
              : extra &&
                  typeof extra === "object" &&
                  "type" in extra &&
                  (extra.type === "0" || extra.type === 0)
                ? 0
                : extra &&
                    typeof extra === "object" &&
                    "type" in extra &&
                    (extra.type === "1" || extra.type === 1)
                  ? 1
                  : undefined;
        if (
          !principal ||
          !snowflake.safeParse(principal.id).success ||
          principal.id !== extraId ||
          principal.type !== extraType
        )
          return outcome(
            "unsupported",
            strategy,
            "The audited overwrite principal and type could not be reliably verified.",
          );
        const channel = await guild.channels.fetch(target, { force: true });
        if (
          !channel ||
          channel.isThread() ||
          !("permissionOverwrites" in channel)
        )
          return outcome(
            "failed",
            strategy,
            "Channel overwrite state is unavailable.",
          );
        const recent = await guild.fetchAuditLogs({ limit: 50 });
        if (
          [...recent.entries.values()].some(
            (entry) =>
              entry.targetId === target &&
              entry.id !== event.id &&
              [
                AuditLogEvent.ChannelOverwriteCreate,
                AuditLogEvent.ChannelOverwriteUpdate,
                AuditLogEvent.ChannelOverwriteDelete,
              ].includes(entry.action) &&
              entry.createdTimestamp >= event.timestamp,
          )
        )
          return outcome(
            "skipped",
            strategy,
            "A newer overwrite action exists on this channel.",
          );
        const changes = event.changes ?? {};
        if (
          Object.keys(changes).some(
            (key) => !["allow", "deny", "id", "type"].includes(key),
          )
        )
          return outcome(
            "unsupported",
            strategy,
            "Unsupported overwrite fields prevent exact reversal.",
          );
        const current = channel.permissionOverwrites.cache.get(principal.id);
        const bits = (value: unknown) =>
          BigInt(
            permission.parse(
              typeof value === "bigint" ? value.toString() : value,
            ),
          );
        if (event.auditAction === AuditLogEvent.ChannelOverwriteCreate) {
          if (!current)
            return outcome(
              "succeeded",
              strategy,
              "Unauthorized overwrite is already absent.",
            );
          if (
            current.type !== principal.type ||
            current.allow.bitfield !== bits(pair.parse(changes.allow).new) ||
            current.deny.bitfield !== bits(pair.parse(changes.deny).new)
          )
            return outcome(
              "skipped",
              strategy,
              "Created overwrite changed again; preserved.",
            );
          await effect("delete-created-overwrite", () =>
            channel.permissionOverwrites.delete(principal.id, reason),
          );
          return outcome(
            "succeeded",
            strategy,
            "Only the unauthorized newly-created overwrite was removed.",
          );
        }
        let allow: bigint, deny: bigint;
        if (event.auditAction === AuditLogEvent.ChannelOverwriteDelete) {
          if (current)
            return outcome(
              "skipped",
              strategy,
              "A replacement overwrite already exists; preserved.",
            );
          allow = bits(pair.parse(changes.allow).old);
          deny = bits(pair.parse(changes.deny).old);
          if (
            principal.type === 0 &&
            !(await guild.roles.fetch(principal.id, { force: true }))
          )
            return outcome(
              "failed",
              strategy,
              "Original overwrite role is missing.",
            );
        } else {
          if (!current || current.type !== principal.type)
            return outcome(
              "failed",
              strategy,
              "Original overwrite no longer exists.",
            );
          allow = current.allow.bitfield;
          deny = current.deny.bitfield;
          let touched = false;
          for (const key of ["allow", "deny"] as const)
            if (changes[key] !== undefined) {
              const change = pair.parse(changes[key]);
              const next = bits(change.new),
                old = bits(change.old);
              if (
                (key === "allow"
                  ? current.allow.bitfield
                  : current.deny.bitfield) !== next
              )
                return outcome(
                  "skipped",
                  strategy,
                  "Overwrite permissions changed again; preserved.",
                );
              if (key === "allow") allow = old;
              else deny = old;
              touched = true;
            }
          if (!touched)
            return outcome(
              "unsupported",
              strategy,
              "No reliable overwrite permission delta exists.",
            );
        }
        if ((allow & deny) !== 0n || !me.permissions.has(allow | deny))
          return outcome(
            "failed",
            strategy,
            "Original overwrite permissions are invalid or exceed bot permissions.",
          );
        await effect("restore-overwrite-fields", () =>
          client.rest.put(Routes.channelPermission(channel.id, principal.id), {
            body: {
              type: principal.type,
              allow: allow.toString(),
              deny: deny.toString(),
            },
            reason,
          }),
        );
        return outcome(
          "succeeded",
          strategy,
          "Only the exact audited overwrite was restored; unrelated overwrites were preserved.",
        );
      }
      if (event.auditAction === AuditLogEvent.ChannelUpdate) {
        strategy = "audited-fields";
        requirePermission(PermissionFlagsBits.ManageChannels);
        const channel = await guild.channels.fetch(target, { force: true });
        if (!channel || channel.isThread() || !("edit" in channel))
          return outcome(
            "failed",
            strategy,
            "Channel is unavailable for exact-field reversal.",
          );
        const changes = event.changes ?? {};
        if (!Object.keys(changes).length)
          return outcome(
            "unsupported",
            strategy,
            "No reliable channel before/after values were recorded.",
          );
        const data: GuildChannelEditOptions = { reason };
        for (const [key, raw] of Object.entries(changes)) {
          const change = pair.parse(raw);
          if (key === "name") {
            const old = text.parse(change.old),
              next = text.parse(change.new);
            if (channel.name !== next)
              throw new Error("Channel name changed again; reversal refused.");
            data.name = old;
          } else if (key === "topic" && "topic" in channel) {
            const schema = z.string().max(4096).nullable();
            const old = schema.parse(change.old),
              next = schema.parse(change.new);
            if (channel.topic !== next)
              throw new Error("Channel topic changed again; reversal refused.");
            data.topic = old;
          } else if (key === "nsfw" && "nsfw" in channel) {
            const old = z.boolean().parse(change.old),
              next = z.boolean().parse(change.new);
            if (channel.nsfw !== next)
              throw new Error("Channel NSFW changed again; reversal refused.");
            data.nsfw = old;
          } else if (
            key === "rate_limit_per_user" &&
            "rateLimitPerUser" in channel
          ) {
            const schema = number.min(0).max(21600),
              old = schema.parse(change.old),
              next = schema.parse(change.new);
            if (channel.rateLimitPerUser !== next)
              throw new Error(
                "Channel rate limit changed again; reversal refused.",
              );
            data.rateLimitPerUser = old;
          } else if (key === "bitrate" && "bitrate" in channel) {
            const schema = number.min(8000).max(guild.maximumBitrate),
              old = schema.parse(change.old),
              next = schema.parse(change.new);
            if (channel.bitrate !== next)
              throw new Error(
                "Channel bitrate changed again; reversal refused.",
              );
            data.bitrate = old;
          } else if (key === "user_limit" && "userLimit" in channel) {
            const schema = number.min(0).max(99),
              old = schema.parse(change.old),
              next = schema.parse(change.new);
            if (channel.userLimit !== next)
              throw new Error(
                "Channel user limit changed again; reversal refused.",
              );
            data.userLimit = old;
          } else if (key === "position") {
            const old = number.min(0).parse(change.old),
              next = number.min(0).parse(change.new);
            if (channel.rawPosition !== next)
              throw new Error(
                "Channel position changed again; reversal refused.",
              );
            data.position = old;
          } else if (key === "parent_id") {
            const schema = snowflake.nullable(),
              old = schema.parse(change.old),
              next = schema.parse(change.new);
            if (channel.parentId !== next)
              throw new Error(
                "Channel parent changed again; reversal refused.",
              );
            if (old) {
              const parent = await guild.channels.fetch(old, { force: true });
              if (!parent || parent.type !== ChannelType.GuildCategory)
                throw new Error("Original parent category is unavailable.");
            }
            data.parent = old;
            data.lockPermissions = false;
          } else
            return outcome(
              "unsupported",
              strategy,
              `Channel field ${key} cannot safely be reversed automatically.`,
            );
        }
        await effect("restore-channel-fields", async () => {
          await channel.edit(data);
        });
        return outcome(
          "succeeded",
          strategy,
          "Only the exact audited channel fields were restored.",
        );
      }
      if (event.auditAction === AuditLogEvent.RoleUpdate) {
        strategy = "audited-fields";
        requirePermission(PermissionFlagsBits.ManageRoles);
        const role = await guild.roles.fetch(target, { force: true });
        if (!role || role.managed || !role.editable)
          return outcome(
            "failed",
            strategy,
            "Role is missing, managed or outside bot hierarchy.",
          );
        const changes = event.changes ?? {};
        if (!Object.keys(changes).length)
          return outcome(
            "unsupported",
            strategy,
            "No reliable role before/after values were recorded.",
          );
        const data: RoleEditOptions = { reason };
        for (const [key, raw] of Object.entries(changes)) {
          const change = pair.parse(raw);
          if (key === "name") {
            const old = text.parse(change.old),
              next = text.parse(change.new);
            if (role.name !== next)
              throw new Error("Role name changed again; reversal refused.");
            data.name = old;
          } else if (key === "permissions") {
            const old = BigInt(permission.parse(String(change.old))),
              next = BigInt(permission.parse(String(change.new)));
            if (role.permissions.bitfield !== next || !me.permissions.has(old))
              throw new Error(
                "Role permissions changed again or exceed bot permissions.",
              );
            data.permissions = old;
          } else if (key === "color") {
            const schema = number.min(0).max(0xffffff),
              old = schema.parse(change.old),
              next = schema.parse(change.new);
            if (role.color !== next)
              throw new Error("Role color changed again; reversal refused.");
            data.color = old;
          } else if (key === "hoist") {
            const old = z.boolean().parse(change.old),
              next = z.boolean().parse(change.new);
            if (role.hoist !== next)
              throw new Error("Role hoist changed again; reversal refused.");
            data.hoist = old;
          } else if (key === "mentionable") {
            const old = z.boolean().parse(change.old),
              next = z.boolean().parse(change.new);
            if (role.mentionable !== next)
              throw new Error(
                "Role mentionable changed again; reversal refused.",
              );
            data.mentionable = old;
          } else
            return outcome(
              "unsupported",
              strategy,
              `Role field ${key} cannot safely be reversed automatically.`,
            );
        }
        if (
          typeof data.permissions === "bigint" &&
          (data.permissions & DANGEROUS_PERMISSIONS) !== 0n
        ) {
          const quarantines = store.list<{
            executorId?: string;
            status?: string;
          }>(guild.id, "containment_records", 1001);
          if (quarantines.length > 1000)
            return outcome(
              "skipped",
              strategy,
              "Too many containment records to safely verify privilege restoration.",
            );
          for (const record of quarantines) {
            if (!record.executorId || record.status === "exempt") continue;
            try {
              const principal = await guild.members.fetch({
                user: record.executorId,
                force: true,
              });
              if (role.id === guild.id || principal.roles.cache.has(role.id))
                return outcome(
                  "skipped",
                  strategy,
                  "Restoring shared role permissions would rearm a previously contained executor.",
                );
            } catch (error) {
              if (code(error) !== 10007) throw error;
            }
          }
        }
        await effect("restore-role-fields", () => role.edit(data));
        return outcome(
          "succeeded",
          strategy,
          "Only exact audited role fields were restored.",
        );
      }
      if (
        event.auditAction === AuditLogEvent.MemberBanAdd ||
        event.auditAction === AuditLogEvent.MemberBanRemove
      ) {
        strategy =
          event.auditAction === AuditLogEvent.MemberBanAdd
            ? "unban-confirmed"
            : "restore-trusted-ban";
        requirePermission(PermissionFlagsBits.BanMembers);
        if (target === guild.ownerId || target === client.user?.id)
          return outcome(
            "skipped",
            strategy,
            "Protected ban target cannot be changed.",
          );
        const history = store.get<BanHistory>(
          guild.id,
          "trusted_history",
          `ban:${target}`,
        );
        const baseline = store.get<BanBaseline>(
          guild.id,
          "trusted_history",
          "bans:baseline",
        );
        const candidates: { exists: boolean; observedAt: number }[] = [];
        if (
          history &&
          history.version === 1 &&
          history.kind === "ban" &&
          history.guildId === guild.id &&
          history.targetId === target &&
          typeof history.exists === "boolean" &&
          Number.isFinite(history.observedAt) &&
          history.observedAt < event.timestamp
        )
          candidates.push(history);
        if (
          baseline &&
          baseline.guildId === guild.id &&
          baseline.complete === true &&
          Number.isFinite(baseline.observedAt) &&
          baseline.observedAt < event.timestamp &&
          Array.isArray(baseline.bannedIds)
        )
          candidates.push({
            exists: baseline.bannedIds.includes(target),
            observedAt: baseline.observedAt,
          });
        const trusted = candidates.sort(
          (a, b) => b.observedAt - a.observedAt,
        )[0];
        if (
          !trusted ||
          trusted.exists !==
            (event.auditAction === AuditLogEvent.MemberBanRemove)
        )
          return outcome(
            "unsupported",
            strategy,
            "A trustworthy pre-incident ban state is unavailable or contradicts the unauthorized transition.",
          );
        // Fetch all later BanAdd/BanRemove records, not only the same action kind.
        const recent = await guild.fetchAuditLogs({ limit: 50 });
        const newerBan = [...recent.entries.values()].some(
          (entry) =>
            entry.targetId === target &&
            [
              AuditLogEvent.MemberBanAdd,
              AuditLogEvent.MemberBanRemove,
            ].includes(entry.action) &&
            entry.id !== event.id &&
            entry.createdTimestamp >= event.timestamp,
        );
        if (newerBan)
          return outcome(
            "skipped",
            strategy,
            "A newer ban transition exists; rollback refused.",
          );
        const current = await guild.bans
          .fetch({ user: target, force: true })
          .catch((error) => {
            if (code(error) === 10026) return null;
            throw error;
          });
        if (event.auditAction === AuditLogEvent.MemberBanAdd) {
          if (!current)
            return outcome(
              "succeeded",
              strategy,
              "Unauthorized ban is already absent; no membership restoration was claimed.",
            );
          if (current.user.id !== target)
            throw new Error("Ban identity mismatch.");
          await effect("remove-unauthorized-ban", () =>
            guild.bans.remove(target, reason),
          );
          return outcome(
            "succeeded",
            strategy,
            "Unauthorized ban removed. The member must choose to rejoin; they were not automatically re-added.",
          );
        }
        if (current)
          return outcome(
            "skipped",
            strategy,
            "A ban already exists; its current authorized state was preserved.",
          );
        const member = await guild.members
          .fetch({ user: target, force: true })
          .catch((error) => {
            if (code(error) === 10007) return null;
            throw error;
          });
        if (
          member &&
          (!member.bannable ||
            me.roles.highest.comparePositionTo(member.roles.highest) <= 0)
        )
          return outcome(
            "failed",
            strategy,
            "Rejoined target is outside bot hierarchy.",
          );
        await effect("restore-authorized-ban", () =>
          guild.bans.create(target, { reason, deleteMessageSeconds: 0 }),
        );
        return outcome(
          "succeeded",
          strategy,
          "The reliably recorded previous ban was restored without deleting messages.",
        );
      }
      if (event.auditAction === AuditLogEvent.MemberKick)
        return outcome(
          "unsupported",
          "manual-rejoin",
          `Confirmed kicked member ${target}. Discord cannot force rejoin; offer a reviewed invite through a trusted moderator.`,
        );
      if (event.auditAction === AuditLogEvent.MemberRoleUpdate) {
        strategy = "member-role-delta";
        requirePermission(PermissionFlagsBits.ManageRoles);
        const additions = readRoleDelta(event.changes?.$add),
          removals = readRoleDelta(event.changes?.$remove);
        if (!additions.length && !removals.length)
          return outcome(
            "unsupported",
            strategy,
            "No reliable role assignment delta exists.",
          );
        if (additions.some((id) => removals.includes(id)))
          return outcome(
            "skipped",
            strategy,
            "Ambiguous overlapping role delta.",
          );
        const member = await guild.members.fetch({ user: target, force: true });
        if (
          member.id === guild.ownerId ||
          member.id === client.user?.id ||
          me.roles.highest.comparePositionTo(member.roles.highest) <= 0
        )
          return outcome(
            "failed",
            strategy,
            "Role target is protected or outside bot hierarchy.",
          );
        const roles = await guild.roles.fetch();
        const remove = additions.filter((id) => member.roles.cache.has(id));
        const add = removals.filter((id) => !member.roles.cache.has(id));
        for (const id of [...remove, ...add]) {
          const role = roles.get(id);
          if (!role || role.managed || !role.editable || role.id === guild.id)
            return outcome(
              "failed",
              strategy,
              "A changed role is unavailable or outside bot hierarchy.",
            );
          if (
            add.includes(id) &&
            target === event.executorId &&
            (role.permissions.bitfield & DANGEROUS_PERMISSIONS) !== 0n
          )
            return outcome(
              "skipped",
              strategy,
              "Rollback would regrant dangerous privileges to the contained executor.",
            );
        }
        if (!remove.length && !add.length)
          return outcome(
            "succeeded",
            strategy,
            "The audited role delta is already reversed; no unrelated role was changed.",
          );
        if (remove.length) {
          const fresh = await guild.members.fetch({
            user: target,
            force: true,
          });
          if (remove.some((id) => !fresh.roles.cache.has(id)))
            throw new Error("Member roles changed during reversal.");
          await effect("remove-unauthorized-member-roles", () =>
            fresh.roles.remove(remove, reason),
          );
        }
        if (add.length) {
          if (quarantined(guild.id, target))
            return outcome(
              "partial",
              strategy,
              "Role restoration skipped for a previously contained executor; manual clearance is required.",
            );
          const fresh = await guild.members.fetch({
            user: target,
            force: true,
          });
          if (add.some((id) => fresh.roles.cache.has(id)))
            throw new Error("Member roles changed during reversal.");
          await effect("restore-member-roles", () => {
            if (quarantined(guild.id, target))
              throw new StopRollback(
                "A contained executor must not regain roles through rollback.",
              );
            return fresh.roles.add(add, reason);
          });
        }
        return outcome(
          "succeeded",
          strategy,
          "Only the unauthorized member-role additions/removals were reversed.",
        );
      }
      if (event.auditAction === AuditLogEvent.GuildUpdate) {
        strategy = "audited-fields";
        await effect("restore-guild-fields", () =>
          reverseAuditEvent(client, event, store, canContinue),
        );
        return outcome(
          "succeeded",
          strategy,
          "Supported guild fields restored after exact live-state validation.",
        );
      }
      if (event.auditAction === AuditLogEvent.WebhookCreate) {
        strategy = "delete-created";
        requirePermission(PermissionFlagsBits.ManageWebhooks);
        const webhooks = await guild.fetchWebhooks();
        const webhook = webhooks.get(target);
        if (!webhook)
          return outcome(
            "succeeded",
            strategy,
            "Unauthorized webhook is already absent.",
          );
        if (
          webhook.guildId !== guild.id ||
          Math.abs(creationTime(webhook.id) - event.timestamp) > 5000
        )
          return outcome(
            "skipped",
            strategy,
            "Webhook creation identity/timestamp mismatch.",
          );
        await effect("delete-created-webhook", () => webhook.delete(reason));
        return outcome("succeeded", strategy, "Unauthorized webhook deleted.");
      }
      if (event.auditAction === AuditLogEvent.AutoModerationRuleCreate) {
        strategy = "delete-created";
        requirePermission(PermissionFlagsBits.ManageGuild);
        const rule = await guild.autoModerationRules.fetch(target);
        if (!rule)
          return outcome(
            "succeeded",
            strategy,
            "Unauthorized AutoMod rule is already absent.",
          );
        if (
          rule.guild.id !== guild.id ||
          Math.abs(creationTime(rule.id) - event.timestamp) > 5000
        )
          return outcome(
            "skipped",
            strategy,
            "AutoMod rule creation identity/timestamp mismatch.",
          );
        await effect("delete-created-automod-rule", () => rule.delete(reason));
        return outcome(
          "succeeded",
          strategy,
          "Unauthorized AutoMod rule deleted.",
        );
      }
      return outcome(
        "unsupported",
        strategy,
        "No safe automatic rollback adapter exists for this action. Containment and incident review remain available.",
      );
    };
    let final: RollbackResult;
    try {
      final = await result();
    } catch (error) {
      logger.warn(
        { err: error, eventId: event.id, guildId: event.guildId, strategy },
        "Anti-nuke rollback failed",
      );
      final = outcome(
        error instanceof StopRollback
          ? sent
            ? "partial"
            : "skipped"
          : [50001, 50013, 50035, 10003, 10011].includes(code(error) ?? 0)
            ? effectsCompleted > 0
              ? "partial"
              : "failed"
            : sent
              ? "uncertain"
              : "failed",
        strategy,
        error instanceof Error ? error.message : "Rollback dependency failed.",
      );
    }
    final.effectsApplied = effectsCompleted > 0;
    attempt.strategy = strategy;
    attempt.state = "done";
    attempt.finishedAt = Date.now();
    attempt.outcome = final;
    try {
      persist();
      return final;
    } finally {
      releaseOperation?.();
    }
  };
  return (
    event: SecurityEvent,
    canContinue: Guard,
  ): Promise<RollbackResult> => {
    const key = `${event.guildId}:${event.id}`;
    const prior = running.get(key);
    if (prior) return prior;
    const task = execute(event, canContinue);
    running.set(key, task);
    void task
      .finally(() => {
        if (running.get(key) === task) running.delete(key);
      })
      .catch(() => undefined);
    return task;
  };
}
function readRoleDelta(value: unknown): string[] {
  if (value === undefined) return [];
  const record = z
    .object({ new: z.array(z.object({ id: snowflake })).max(250) })
    .parse(value);
  return [...new Set(record.new.map((role) => role.id))];
}
