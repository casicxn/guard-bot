import { createHash } from "node:crypto";
import {
  GatewayIntentBits,
  PermissionFlagsBits,
  type Client,
} from "discord.js";
import type { Store } from "../contracts.js";
import { validateSnapshot, type Snapshot } from "./schema.js";
import type { Logger } from "pino";

export interface KnownGoodMetadata {
  version: 1;
  snapshotId: string;
  guildId: string;
  createdAt: number;
  approvedAt: number;
  source: "owner" | "trusted-audit";
  digest: string;
}
export const snapshotDigest = (snapshot: Snapshot): string =>
  createHash("sha256")
    .update(JSON.stringify(validateSnapshot(snapshot, snapshot.guildId)))
    .digest("hex");

/** Legacy snapshots require explicit approval; a date alone is never evidence of trust. */
export function findKnownGoodSnapshot(
  store: Store,
  guildId: string,
  beforeTimestamp = Date.now() + 1,
): Snapshot | undefined {
  const blocked = store.get<{ blockedSince: number }>(
    guildId,
    "recovery_guard",
    "main",
  )?.blockedSince;
  const cutoff = Math.min(beforeTimestamp, blocked ?? Infinity);
  for (const metadata of store
    .list<KnownGoodMetadata>(guildId, "known_good_snapshots")
    .sort((a, b) => b.createdAt - a.createdAt)) {
    if (
      metadata.version !== 1 ||
      metadata.guildId !== guildId ||
      !Number.isFinite(metadata.approvedAt) ||
      metadata.createdAt >= cutoff ||
      metadata.approvedAt >= cutoff ||
      !["owner", "trusted-audit"].includes(metadata.source)
    )
      continue;
    try {
      const snapshot = validateSnapshot(
        store.get(guildId, "backups", metadata.snapshotId),
        guildId,
      );
      if (
        snapshot.createdAt !== metadata.createdAt ||
        snapshotDigest(snapshot) !== metadata.digest
      )
        continue;
      return snapshot;
    } catch {
      /* Corrupt or deleted snapshots cannot authorize restoration. */
    }
  }
  return undefined;
}

export function approveSnapshot(
  store: Store,
  guildId: string,
  snapshotId: string,
  approvedAt = Date.now(),
): void {
  const snapshot = validateSnapshot(
    store.get(guildId, "backups", snapshotId),
    guildId,
  );
  if (store.get(guildId, "recovery_guard", "main"))
    throw new Error(
      "Suspicious state is quarantined; retain the previous known-good baseline.",
    );
  store.put<KnownGoodMetadata>(guildId, "known_good_snapshots", snapshot.id, {
    version: 1,
    snapshotId: snapshot.id,
    guildId,
    createdAt: snapshot.createdAt,
    approvedAt,
    source: "owner",
    digest: snapshotDigest(snapshot),
  });
}

/** Called only during explicit, owner-confirmed activation; optional capture failure degrades recovery. */
export async function prepareProtectionBaseline(
  client: Client,
  store: Store,
  guildId: string,
): Promise<void> {
  // An owner mode toggle is not approval to replace a previously trusted recovery baseline.
  if (findKnownGoodSnapshot(store, guildId)) return;
  if (store.get(guildId, "recovery_guard", "main")) {
    if (findKnownGoodSnapshot(store, guildId)) return;
    throw new Error(
      "No trustworthy pre-incident snapshot; automatic structural recovery unavailable.",
    );
  }
  const captureStartedAt = Date.now();
  const { createBackupService } = await import("./index.js");
  const quietLogger = { warn: () => undefined } as unknown as Logger;
  const snapshot = await createBackupService(client, store, quietLogger).create(
    guildId,
  );
  approveSnapshot(store, guildId, snapshot.id);
  // Best-effort extra history must not invalidate the independently validated structure.
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const me = await guild.members.fetchMe({ force: true });
  if (me.permissions.has(PermissionFlagsBits.BanMembers)) {
    try {
      const bannedIds: string[] = [];
      let after: string | undefined;
      let complete = false;
      for (let page = 0; page < 50; page++) {
        const bans = await guild.bans.fetch({
          limit: 1000,
          ...(after ? { after } : {}),
          cache: false,
        });
        bannedIds.push(...bans.keys());
        if (bans.size < 1000) {
          complete = true;
          break;
        }
        const last = [...bans.keys()]
          .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
          .at(-1);
        if (!last || last === after) break;
        after = last;
      }
      if (complete && !store.get(guildId, "recovery_guard", "main"))
        store.put(guildId, "trusted_history", "bans:baseline", {
          version: 1,
          guildId,
          observedAt: captureStartedAt,
          complete: true,
          bannedIds: [...new Set(bannedIds)],
        });
    } catch {
      /* No complete ban baseline means no speculative ban reversal. */
    }
  }
  if (client.options.intents.has(GatewayIntentBits.GuildMembers)) {
    try {
      const members = await guild.members.fetch({
        withPresences: false,
        time: 15000,
      });
      if (
        members.size !== guild.memberCount ||
        store.get(guildId, "recovery_guard", "main")
      )
        return;
      const byRole = new Map<string, string[]>();
      for (const member of members.values())
        for (const roleId of member.roles.cache.keys()) {
          const ids = byRole.get(roleId) ?? [];
          ids.push(member.id);
          byRole.set(roleId, ids);
        }
      const observedAt = captureStartedAt;
      for (const [roleId, memberIds] of byRole)
        if (
          (store.get<{ observedAt: number }>(
            guildId,
            "trusted_history",
            `members:${roleId}`,
          )?.observedAt ?? 0) <= observedAt
        )
          store.put(guildId, "trusted_history", `members:${roleId}`, {
            guildId,
            roleId,
            memberIds,
            observedAt,
            complete: true,
          });
    } catch {
      /* Partial member caches never authorize reassignment. */
    }
  }
}
