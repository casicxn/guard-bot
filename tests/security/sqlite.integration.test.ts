import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi } from "vitest";
import { SqliteStore } from "../../src/database/index.js";
import { SecurityEngine } from "../../src/security/index.js";
import type {
  EnforcementAdapter,
  Incident,
  SecurityEvent,
} from "../../src/contracts.js";
const now = 1700000000000;
const event: SecurityEvent = {
  id: "audit-1",
  guildId: "guild",
  action: "channel.delete",
  targetId: "channel",
  executorId: "actor",
  timestamp: now,
  source: "audit",
  auditAction: 12,
};
function adapter(): EnforcementAdapter {
  return {
    context: vi.fn(async () => ({
      ownerId: "owner",
      selfId: "self",
      roleIds: ["trusted"],
      isBot: false,
    })),
    enforce: vi.fn(async () => "Done"),
    log: vi.fn(async () => {}),
  };
}
function protect(store: SqliteStore) {
  const c = store.getConfig("guild");
  c.mode = "protect";
  c.modules["channel.delete"] = {
    enabled: true,
    mode: "protect",
    threshold: 1,
    windowMs: 60000,
    action: "kick",
  };
  store.setConfig("guild", c);
}
describe("SQLite security integration", () => {
  it("persists configuration, incidents and dedupe across database restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ultimate-security-"));
    const path = join(dir, "guard.db");
    let store = new SqliteStore(path);
    try {
      protect(store);
      const api = adapter();
      await new SecurityEngine(store, api, () => now).process(event);
      store.close();
      store = new SqliteStore(path);
      expect(store.getConfig("guild").mode).toBe("protect");
      expect(store.get<Incident>("guild", "incidents", event.id)?.status).toBe(
        "handled",
      );
      await new SecurityEngine(store, api, () => now).process(event);
      expect(api.enforce).toHaveBeenCalledTimes(1);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("never replays a pending decision after an interrupted effect", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ultimate-interrupt-"));
    const path = join(dir, "guard.db");
    let store = new SqliteStore(path);
    let closed = false;
    try {
      protect(store);
      const api = adapter();
      vi.mocked(api.enforce).mockImplementation(async () => {
        store.close();
        closed = true;
        return "Effect may have happened";
      });
      await expect(
        new SecurityEngine(store, api, () => now).process(event),
      ).rejects.toThrow();
      store = new SqliteStore(path);
      closed = false;
      expect(store.get<Incident>("guild", "incidents", event.id)?.status).toBe(
        "pending",
      );
      expect(
        await new SecurityEngine(store, api, () => now).process(event),
      ).toBeUndefined();
      expect(api.enforce).toHaveBeenCalledTimes(1);
    } finally {
      if (!closed) store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("records unresolved gateway events without actor lookup or punishment", async () => {
    const store = new SqliteStore(":memory:");
    try {
      protect(store);
      const api = adapter();
      await new SecurityEngine(store, api, () => now).process({
        ...event,
        source: "gateway",
        executorId: null,
      });
      expect(store.list<Incident>("guild", "incidents")[0]?.confidence).toBe(
        "unresolved",
      );
      expect(api.context).not.toHaveBeenCalled();
      expect(api.enforce).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });
  it("keeps role whitelist scoped to action and guild in persistent storage", async () => {
    const store = new SqliteStore(":memory:");
    try {
      protect(store);
      store.put("guild", "whitelist", "trusted", {
        id: "trusted",
        kind: "role",
        subjectId: "trusted",
        actions: ["channel.delete"],
      });
      const api = adapter();
      await new SecurityEngine(store, api, () => now).process(event);
      expect(store.list<Incident>("guild", "incidents")[0]?.status).toBe(
        "exempt",
      );
      expect(api.enforce).not.toHaveBeenCalled();
      expect(store.list("other", "whitelist")).toEqual([]);
    } finally {
      store.close();
    }
  });
  it("raid modules remain unresolved monitor-only even when an active policy is selected", async () => {
    const store = new SqliteStore(":memory:");
    try {
      const c = store.getConfig("guild");
      c.mode = "protect";
      c.modules["raid.join"] = {
        enabled: true,
        mode: "protect",
        threshold: 1,
        windowMs: 60000,
        action: "ban",
      };
      store.setConfig("guild", c);
      const api = adapter();
      const result = await new SecurityEngine(store, api, () => now).process({
        ...event,
        action: "raid.join",
        source: "gateway",
      });
      expect(result?.confidence).toBe("unresolved");
      expect(api.enforce).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });
});
