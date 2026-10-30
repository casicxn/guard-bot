import { describe, it, expect, vi } from "vitest";
import { SqliteStore } from "../../src/database/index.js";
import type { Incident } from "../../src/contracts.js";
const incident = (): Incident => ({
  id: "event",
  guildId: "guild",
  event: {
    id: "event",
    guildId: "guild",
    action: "channel.delete",
    targetId: "target",
    executorId: "actor",
    source: "audit",
    auditAction: 12,
    timestamp: Date.now(),
  },
  createdAt: Date.now(),
  confidence: "confirmed",
  policy: "log",
  status: "recorded",
  result: "Monitor only",
});
describe("atomic SQLite incident decisions", () => {
  it("rolls back the claim when initial incident storage fails", () => {
    const store = new SqliteStore(":memory:");
    try {
      const fail = vi.spyOn(store, "put").mockImplementationOnce(() => {
        throw new Error("Disk unavailable");
      });
      expect(() => store.claimIncident(incident())).toThrow("Disk unavailable");
      fail.mockRestore();
      expect(store.claimIncident(incident())).toBe(true);
      expect(store.claimIncident(incident())).toBe(false);
      expect(store.list("guild", "incidents")).toHaveLength(1);
    } finally {
      store.close();
    }
  });
  it("adds newly introduced modules in monitor mode without changing existing policies", () => {
    const store = new SqliteStore(":memory:");
    try {
      const config = store.getConfig("guild");
      config.mode = "protect";
      config.modules = {
        "channel.delete": {
          enabled: true,
          mode: "protect",
          action: "kick",
          threshold: 1,
          windowMs: 60000,
        },
      };
      store.setConfig("guild", config);
      const loaded = store.getConfig("guild");
      expect(loaded.modules["channel.delete"]?.action).toBe("kick");
      expect(loaded.modules["member.permissions"]?.mode).toBe("monitor");
      expect(loaded.modules["member.permissions"]?.action).toBe("log");
    } finally {
      store.close();
    }
  });
  it("paginates rows within the selected guild", () => {
    const store = new SqliteStore(":memory:");
    try {
      for (let n = 0; n < 5; n++) store.put("guild", "test", String(n), n);
      store.put("other", "test", "leak", 99);
      const a = store.list<number>("guild", "test", 3, 0),
        b = store.list<number>("guild", "test", 3, 3);
      expect(new Set([...a, ...b]).size).toBe(5);
      expect([...a, ...b]).not.toContain(99);
    } finally {
      store.close();
    }
  });
});
