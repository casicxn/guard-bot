import type { SecurityEvent, Store } from "../contracts.js";
import { randomUUID } from "node:crypto";
import {
  findKnownGoodSnapshot,
  snapshotDigest,
  type KnownGoodMetadata,
} from "./known-good.js";
import { validateSnapshot } from "./schema.js";

/** Advance only exact old→new fields of an already trusted copy, never copy attacker-modified live state. */
function advanceTrustedConfiguration(store: Store, event: SecurityEvent): void {
  if (store.get(event.guildId, "recovery_guard", "main")) return;
  const previous = findKnownGoodSnapshot(store, event.guildId, event.timestamp);
  if (!previous || !event.changes || !Object.keys(event.changes).length) return;
  const next = structuredClone(previous);
  let target: Record<string, unknown> | undefined;
  let names: Record<string, string> = {};
  if (event.auditAction === 31) {
    target = next.roles.find((role) => role.id === event.targetId);
    names = {
      name: "name",
      permissions: "permissions",
      color: "color",
      hoist: "hoist",
      mentionable: "mentionable",
      position: "position",
    };
  } else if (event.auditAction === 11) {
    target = next.channels.find((channel) => channel.id === event.targetId);
    names = {
      name: "name",
      topic: "topic",
      nsfw: "nsfw",
      rate_limit_per_user: "rateLimitPerUser",
      bitrate: "bitrate",
      user_limit: "userLimit",
      position: "position",
      parent_id: "parentId",
    };
  } else if (event.auditAction === 1) {
    target = next.guild;
    names = {
      name: "name",
      verification_level: "verificationLevel",
      explicit_content_filter: "explicitContentFilter",
      default_message_notifications: "defaultMessageNotifications",
    };
  }
  if (!target) return;
  for (const [key, value] of Object.entries(event.changes)) {
    const property = names[key];
    if (
      !property ||
      !value ||
      typeof value !== "object" ||
      !("old" in value) ||
      !("new" in value) ||
      JSON.stringify(target[property]) !== JSON.stringify(value.old)
    )
      return;
    target[property] = value.new;
  }
  try {
    next.id = randomUUID();
    next.createdAt = event.timestamp;
    const validated = validateSnapshot(next, event.guildId);
    store.put(event.guildId, "backups", validated.id, validated);
    store.put<KnownGoodMetadata>(
      event.guildId,
      "known_good_snapshots",
      validated.id,
      {
        version: 1,
        guildId: event.guildId,
        snapshotId: validated.id,
        createdAt: event.timestamp,
        approvedAt: event.timestamp,
        source: "trusted-audit",
        digest: snapshotDigest(validated),
      },
    );
  } catch {
    /* Invalid audit properties cannot create a trusted recovery baseline. */
  }
}

/** Only the engine's confirmed exemption branch calls this; gateway observations cannot update trust. */
export function recordTrustedHistory(store: Store, event: SecurityEvent): void {
  if (event.source !== "audit" || !event.targetId || !event.executorId) return;
  advanceTrustedConfiguration(store, event);
  if (event.action.startsWith("role.") || event.action.startsWith("channel."))
    store.put(event.guildId, "configuration_history", event.id, {
      version: 1,
      guildId: event.guildId,
      targetId: event.targetId,
      action: event.action,
      observedAt: event.timestamp,
      changes: event.changes ?? {},
      trusted: true,
    });
  if (event.action === "member.ban" || event.action === "member.unban") {
    const old = store.get<{ observedAt: number }>(
      event.guildId,
      "trusted_history",
      `ban:${event.targetId}`,
    );
    if (old && old.observedAt >= event.timestamp) return;
    store.put(event.guildId, "trusted_history", `ban:${event.targetId}`, {
      version: 1,
      kind: "ban",
      guildId: event.guildId,
      targetId: event.targetId,
      exists: event.action === "member.ban",
      observedAt: event.timestamp,
    });
  }
  if (event.auditAction === 25) {
    for (const [key, added] of [
      ["$add", true],
      ["$remove", false],
    ] as const) {
      const change = event.changes?.[key] as { new?: unknown } | undefined;
      if (!Array.isArray(change?.new)) continue;
      for (const item of change.new) {
        if (
          !item ||
          typeof item !== "object" ||
          !("id" in item) ||
          typeof item.id !== "string"
        )
          continue;
        const history = store.get<{
          guildId: string;
          roleId: string;
          memberIds: string[];
          observedAt: number;
          complete: true;
        }>(event.guildId, "trusted_history", `members:${item.id}`);
        if (
          !history ||
          history.observedAt >= event.timestamp ||
          history.guildId !== event.guildId ||
          !history.complete
        )
          continue;
        const ids = new Set(history.memberIds);
        if (added) ids.add(event.targetId);
        else ids.delete(event.targetId);
        store.put(event.guildId, "trusted_history", `members:${item.id}`, {
          ...history,
          memberIds: [...ids],
          observedAt: event.timestamp,
        });
      }
    }
  }
}
