import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect } from "vitest";
import { SqliteStore } from "../../src/database/index.js";
import {
  approveSnapshot,
  findKnownGoodSnapshot,
  prepareProtectionBaseline,
} from "../../src/recovery/known-good.js";
import type { Client } from "discord.js";
import { recordTrustedHistory } from "../../src/recovery/trusted-history.js";
import type { Snapshot } from "../../src/recovery/schema.js";
const snapshot = (createdAt = 100): Snapshot => ({
  version: 1,
  id: randomUUID(),
  guildId: "100",
  createdAt,
  guild: {
    name: "Example",
    verificationLevel: 1,
    explicitContentFilter: 0,
    defaultMessageNotifications: 0,
  },
  roles: [],
  channels: [],
  skippedChannels: [],
});
describe("trusted pre-incident recovery evidence", () => {
  it("reuses the approved baseline when protection is re-enabled instead of blessing changed live state", async () => {
    const store = new SqliteStore(":memory:");
    try {
      const s = snapshot();
      store.put("100", "backups", s.id, s);
      approveSnapshot(store, "100", s.id, 150);
      await prepareProtectionBaseline(
        {
          guilds: {
            fetch: () => {
              throw new Error(
                "Live state must not replace the approved baseline",
              );
            },
          },
        } as unknown as Client,
        store,
        "100",
      );
      expect(findKnownGoodSnapshot(store, "100")?.id).toBe(s.id);
      expect(store.list("100", "backups")).toHaveLength(1);
    } finally {
      store.close();
    }
  });
  it("advances a trusted field history only when the old baseline matches and freezes it after an incident", () => {
    const store = new SqliteStore(":memory:");
    try {
      const s = snapshot();
      s.roles = [
        {
          id: "200",
          name: "Original",
          permissions: "0",
          color: 0,
          hoist: false,
          mentionable: false,
          position: 1,
          managed: false,
        },
      ];
      store.put("100", "backups", s.id, s);
      approveSnapshot(store, "100", s.id, 110);
      const event = {
        id: "edit",
        guildId: "100",
        action: "role.update",
        auditAction: 31,
        targetId: "200",
        executorId: "300",
        timestamp: 150,
        source: "audit" as const,
        changes: { name: { old: "Original", new: "Authorized" } },
      };
      recordTrustedHistory(store, event);
      expect(findKnownGoodSnapshot(store, "100", 200)?.roles[0]?.name).toBe(
        "Authorized",
      );
      recordTrustedHistory(store, {
        ...event,
        id: "stale",
        timestamp: 170,
        changes: { name: { old: "Original", new: "Wrong" } },
      });
      expect(findKnownGoodSnapshot(store, "100", 200)?.roles[0]?.name).toBe(
        "Authorized",
      );
      store.put("100", "recovery_guard", "main", { blockedSince: 190 });
      recordTrustedHistory(store, {
        ...event,
        id: "after",
        timestamp: 210,
        changes: { name: { old: "Authorized", new: "After incident" } },
      });
      expect(findKnownGoodSnapshot(store, "100", 300)?.roles[0]?.name).toBe(
        "Authorized",
      );
    } finally {
      store.close();
    }
  });
  it("does not bless legacy snapshots and rejects corrupt or cross-guild copies", () => {
    const store = new SqliteStore(":memory:");
    try {
      const s = snapshot();
      store.put("100", "backups", s.id, s);
      expect(findKnownGoodSnapshot(store, "100", 300)).toBeUndefined();
      approveSnapshot(store, "100", s.id, 150);
      expect(findKnownGoodSnapshot(store, "100", 300)?.id).toBe(s.id);
      expect(findKnownGoodSnapshot(store, "200", 300)).toBeUndefined();
      store.put("100", "backups", s.id, {
        ...s,
        guild: { ...s.guild, name: "Attacker" },
      });
      expect(findKnownGoodSnapshot(store, "100", 300)).toBeUndefined();
    } finally {
      store.close();
    }
  });
  it("quarantines post-incident candidates and retains the last valid earlier baseline", () => {
    const store = new SqliteStore(":memory:");
    try {
      const old = snapshot(),
        fresh = snapshot(220);
      store.put("100", "backups", old.id, old);
      approveSnapshot(store, "100", old.id, 110);
      store.put("100", "backups", fresh.id, fresh);
      approveSnapshot(store, "100", fresh.id, 230);
      store.put("100", "recovery_guard", "main", { blockedSince: 200 });
      expect(findKnownGoodSnapshot(store, "100", 300)?.id).toBe(old.id);
      expect(() => approveSnapshot(store, "100", fresh.id, 240)).toThrow();
      expect(findKnownGoodSnapshot(store, "100", 105)).toBeUndefined();
    } finally {
      store.close();
    }
  });
  it("updates trusted ban history monotonically and ignores unattributed gateway changes", () => {
    const store = new SqliteStore(":memory:");
    try {
      const event = {
        id: "1",
        guildId: "100",
        action: "member.ban",
        targetId: "200",
        executorId: "300",
        timestamp: 100,
        source: "audit" as const,
      };
      recordTrustedHistory(store, event);
      recordTrustedHistory(store, {
        ...event,
        timestamp: 90,
        action: "member.unban",
      });
      expect(store.get("100", "trusted_history", "ban:200")).toMatchObject({
        exists: true,
        observedAt: 100,
      });
      recordTrustedHistory(store, {
        ...event,
        timestamp: 120,
        action: "member.unban",
        source: "gateway",
      });
      expect(store.get("100", "trusted_history", "ban:200")).toMatchObject({
        exists: true,
      });
      recordTrustedHistory(store, {
        ...event,
        timestamp: 130,
        action: "member.unban",
      });
      expect(store.get("100", "trusted_history", "ban:200")).toMatchObject({
        exists: false,
        observedAt: 130,
      });
    } finally {
      store.close();
    }
  });
  it("migrates an existing version-two SQLite database without resetting settings or evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "guard-migrate-"));
    const file = join(directory, "guard.sqlite");
    let store: SqliteStore | undefined;
    try {
      store = new SqliteStore(file);
      const config = store.getConfig("100");
      config.mode = "protect";
      delete config.zeroTolerance;
      store.put("100", "config", "main", config);
      store.put("100", "whitelist", "old", { actions: ["role.update"] });
      store.put("100", "rollback_attempts", "old", { status: "uncertain" });
      store.close();
      store = undefined;
      const raw = new DatabaseSync(file);
      raw.exec(
        "DELETE FROM migrations WHERE version=3; DROP TABLE record_schemas;",
      );
      raw.close();
      store = new SqliteStore(file);
      expect(store.getConfig("100")).toMatchObject({
        mode: "protect",
        zeroTolerance: false,
      });
      expect(store.get("100", "whitelist", "old")).toEqual({
        actions: ["role.update"],
      });
      expect(store.get("100", "rollback_attempts", "old")).toEqual({
        status: "uncertain",
      });
      store.close();
      store = new SqliteStore(file);
      expect(store.get("100", "rollback_attempts", "old")).toMatchObject({
        status: "uncertain",
      });
    } finally {
      store?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
