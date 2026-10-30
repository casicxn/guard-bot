import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../src/database/index.js";

describe("complete durable state restart", () => {
  it("retains protection, preferences, trusted principals, backups, journals, voice and panel IDs after repeated opens", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-state-")),
      path = join(dir, "guard.sqlite");
    let db = new SqliteStore(path);
    try {
      const config = db.getConfig("guild");
      Object.assign(config, {
        mode: "protect",
        zeroTolerance: true,
        protectionActivatedAt: 12345,
        language: "en",
        logChannelId: "123456789012345678",
        notificationsEnabled: false,
        backupRetention: 27,
        backupIntervalHours: 17,
      });
      config.modules["channel.create"] = {
        enabled: false,
        mode: "protect",
        threshold: 7,
        windowMs: 42000,
        action: "ban",
      };
      db.setConfig("guild", config);
      const records: Record<string, unknown> = {
        whitelist: {
          id: "record",
          subjectId: "123456789012345678",
          kind: "role",
          actions: ["role.update"],
          expiresAt: Date.now() + 86400000,
        },
        backups: {
          id: "record",
          checksum: "kept",
          channels: [{ id: "original" }],
        },
        incidents: { id: "record", status: "handled", result: "preserved" },
        protection_preferences: { modules: config.modules },
        permanent_panel: {
          version: 1,
          panelChannelId: "123456789012345678",
          panelMessageId: "223456789012345678",
          panelEnabled: true,
          panelLanguage: "en",
          panelCreatedAt: 123,
          status: "ready",
        },
        runtime: {
          version: 1,
          autoJoin: true,
          channelId: "123456789012345678",
          selfMute: false,
          selfDeaf: true,
          manualDisconnect: false,
        },
        restore_mappings: {
          role: { old: "replacement" },
          channel: { old: "replacement" },
        },
        recovery_jobs: { status: "partial", operations: ["pending"] },
        rollback_attempts: { status: "uncertain", replay: false },
        known_good_snapshots: { checksum: "pinned" },
      };
      for (const [collection, value] of Object.entries(records))
        db.put("guild", collection, "record", value);
      db.put("$global", "runtime", "presence", {
        status: "obsolete-db-profile",
      });
      expect(db.claim("guild", "audit:record")).toBe(true);
      for (let index = 0; index < 3; index++) {
        db.close();
        db = new SqliteStore(path);
        expect(db.getConfig("guild")).toEqual(config);
        for (const [collection, value] of Object.entries(records))
          expect(db.get("guild", collection, "record")).toEqual(value);
        expect(db.get("$global", "runtime", "presence")).toEqual({
          status: "obsolete-db-profile",
        });
        expect(db.claim("guild", "audit:record")).toBe(false);
        expect(db.getConfig("new-guild").mode).toBe("monitor");
        expect(db.get("new-guild", "config", "main")).toBeUndefined();
      }
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("fails explicitly and rolls back a failed migration without deleting prior records", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-migrate-")),
      path = join(dir, "guard.sqlite");
    const db = new SqliteStore(path);
    db.put("guild", "whitelist", "keep", { subjectId: "keep" });
    db.close();
    const raw = new DatabaseSync(path);
    raw.exec(
      "DELETE FROM migrations WHERE version=3; CREATE TRIGGER reject_registry BEFORE INSERT ON record_schemas BEGIN SELECT RAISE(ABORT,'fixture migration failure'); END;",
    );
    raw.close();
    try {
      expect(() => new SqliteStore(path)).toThrow(
        "SQLite initialization or migration failed",
      );
      const after = new DatabaseSync(path);
      expect(
        after
          .prepare(
            "SELECT value FROM records WHERE guild_id='guild' AND id='keep'",
          )
          .get()?.value,
      ).toBe('{"subjectId":"keep"}');
      expect(
        after.prepare("SELECT version FROM migrations WHERE version=3").get(),
      ).toBeUndefined();
      after.exec("DROP TRIGGER reject_registry");
      after.close();
      const recovered = new SqliteStore(path);
      expect(recovered.get("guild", "whitelist", "keep")).toEqual({
        subjectId: "keep",
      });
      recovered.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
