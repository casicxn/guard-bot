import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../src/database/index.js";
import { readEnvironment } from "../../src/configuration/index.js";
describe("SQLite persistence and isolation", () => {
  it("persists settings and claims across restart, isolates guilds", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-"));
    const path = join(dir, "test.sqlite");
    let db = new SqliteStore(path);
    try {
      const config = db.getConfig("a");
      expect(config.mode).toBe("monitor");
      config.mode = "protect";
      db.setConfig("a", config);
      expect(db.claim("a", "event")).toBe(true);
      expect(db.claim("a", "event")).toBe(false);
      db.close();
      db = new SqliteStore(path);
      expect(db.getConfig("a").mode).toBe("protect");
      expect(db.getConfig("b").mode).toBe("monitor");
      expect(db.claim("a", "event")).toBe(false);
      expect(db.claim("b", "event")).toBe(true);
      db.put("a", "incidents", "1", { foo: "bar" });
      expect(db.list("b", "incidents")).toEqual([]);
      expect(db.get("a", "incidents", "1")).toEqual({ foo: "bar" });
      db.delete("a", "incidents", "1");
      expect(db.list("a", "incidents")).toEqual([]);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("rejects invalid config and invalid credentials", () => {
    const db = new SqliteStore(":memory:");
    try {
      const c = db.getConfig("a");
      c.incidentRetentionDays = -1;
      expect(() => db.setConfig("a", c)).toThrow();
      expect(() => readEnvironment({})).toThrow();
    } finally {
      db.close();
    }
  });
});
