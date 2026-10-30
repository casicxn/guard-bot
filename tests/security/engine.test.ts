import { describe, it, expect, vi } from "vitest";
import {
  SecurityEngine,
  defaultModules,
  correlateAudit,
  dangerousPermissionGrant,
} from "../../src/security/index.js";
import type {
  Store,
  GuildConfig,
  SecurityEvent,
  EnforcementAdapter,
  WhitelistEntry,
} from "../../src/contracts.js";
class MemoryStore implements Store {
  data = new Map<string, unknown>();
  claims = new Set<string>();
  configs = new Map<string, GuildConfig>();
  getConfig(g: string): GuildConfig {
    return (
      this.configs.get(g) ?? {
        mode: "monitor",
        modules: defaultModules(),
        incidentRetentionDays: 30,
        backupRetention: 10,
        backupIntervalHours: 24,
        lockdown: false,
      }
    );
  }
  setConfig(g: string, c: GuildConfig) {
    this.configs.set(g, c);
  }
  get<T>(g: string, c: string, id: string): T | undefined {
    return this.data.get(`${g}/${c}/${id}`) as T | undefined;
  }
  put<T>(g: string, c: string, id: string, v: T) {
    this.data.set(`${g}/${c}/${id}`, structuredClone(v));
  }
  list<T>(g: string, c: string): T[] {
    return [...this.data]
      .filter(([k]) => k.startsWith(`${g}/${c}/`))
      .map(([, v]) => v as T);
  }
  delete(g: string, c: string, id: string) {
    this.data.delete(`${g}/${c}/${id}`);
  }
  claim(g: string, k: string) {
    const id = `${g}/${k}`;
    if (this.claims.has(id)) return false;
    this.claims.add(id);
    return true;
  }
  close() {}
}
const now = 1700000000000;
function event(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: "100",
    guildId: "guild",
    action: "channel.delete",
    targetId: "target",
    executorId: "actor",
    timestamp: now,
    source: "audit",
    auditAction: 12,
    ...overrides,
  };
}
function fixture(protect = true) {
  const store = new MemoryStore();
  const config = store.getConfig("guild");
  if (protect) {
    config.mode = "protect";
    for (const p of Object.values(config.modules)) {
      p.mode = "protect";
      p.action = "kick";
    }
  }
  store.setConfig("guild", config);
  const adapter: EnforcementAdapter = {
    context: vi.fn(async () => ({
      ownerId: "owner",
      selfId: "self",
      roleIds: ["trusted"],
      isBot: false,
    })),
    enforce: vi.fn(async () => "Kick succeeded"),
    log: vi.fn(async () => {}),
  };
  return {
    store,
    adapter,
    engine: new SecurityEngine(store, adapter, () => now),
  };
}
describe("security pipeline", () => {
  it.each([
    ["channel.create", 10],
    ["channel.delete", 12],
    ["role.delete", 32],
    ["member.kick", 20],
  ] as const)(
    "detects %s from matching audit action",
    async (action, auditAction) => {
      const { engine } = fixture();
      expect(
        (await engine.process(event({ action, auditAction })))?.confidence,
      ).toBe("confirmed");
    },
  );
  it("new guilds never enforce", async () => {
    const { engine, adapter } = fixture(false);
    await engine.process(event());
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it.each([
    { source: "gateway" as const },
    { executorId: null },
    { targetId: null },
    { auditAction: 10 },
    { timestamp: now - 60001 },
    { timestamp: now + 6000 },
  ])("does not enforce uncertain identity %o", async (changes) => {
    const { engine, adapter } = fixture();
    expect((await engine.process(event(changes)))?.confidence).toBe(
      "unresolved",
    );
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it.each(["owner", "self"])("exempts %s", async (executorId) => {
    const { engine, adapter } = fixture();
    expect((await engine.process(event({ executorId })))?.status).toBe(
      "exempt",
    );
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent audit deliveries and restarts", async () => {
    const { engine, adapter, store } = fixture();
    await Promise.all([engine.process(event()), engine.process(event())]);
    await new SecurityEngine(store, adapter, () => now).process(event());
    expect(adapter.enforce).toHaveBeenCalledTimes(1);
  });
  it("retains independent concurrent audit IDs even when action and target match", async () => {
    const { engine, adapter, store } = fixture();
    await Promise.all([
      engine.process(event({ id: "first" })),
      engine.process(event({ id: "second" })),
    ]);
    expect(store.list("guild", "incidents")).toHaveLength(2);
    expect(adapter.enforce).toHaveBeenCalledTimes(2);
  });
  it("enforces mass bans only at configured threshold", async () => {
    const { engine, adapter } = fixture();
    for (let i = 0; i < 4; i++)
      await engine.process(
        event({ id: `ban${i}`, action: "member.ban", auditAction: 22 }),
      );
    expect(adapter.enforce).not.toHaveBeenCalled();
    await engine.process(
      event({ id: "ban4", action: "member.ban", auditAction: 22 }),
    );
    expect(adapter.enforce).toHaveBeenCalledTimes(1);
  });
  it("delayed old events do not inflate a short rate window", async () => {
    const { engine, store, adapter } = fixture();
    const c = store.getConfig("guild");
    c.modules["member.ban"]!.windowMs = 10000;
    store.setConfig("guild", c);
    for (let i = 0; i < 5; i++)
      await engine.process(
        event({
          id: "delayed" + i,
          action: "member.ban",
          auditAction: 22,
          timestamp: now - 30000,
        }),
      );
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it("sliding window discards expired actions", async () => {
    const { engine, store, adapter } = fixture();
    store.put("guild", "counters", "member.ban:actor", [
      now - 60000,
      now - 60001,
      now - 60002,
      now - 60003,
    ]);
    await engine.process(event({ action: "member.ban", auditAction: 22 }));
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it.each(["user", "role"] as const)(
    "honors granular %s whitelist",
    async (kind) => {
      const { engine, store, adapter } = fixture();
      store.put<WhitelistEntry>("guild", "whitelist", "entry", {
        id: "entry",
        kind,
        subjectId: kind === "user" ? "actor" : "trusted",
        actions: ["channel.delete"],
      });
      await engine.process(event());
      expect(adapter.enforce).not.toHaveBeenCalled();
      await engine.process(
        event({ id: "other", action: "role.delete", auditAction: 32 }),
      );
      expect(adapter.enforce).toHaveBeenCalledOnce();
    },
  );
  it("expired whitelist has no authority", async () => {
    const { engine, store, adapter } = fixture();
    store.put<WhitelistEntry>("guild", "whitelist", "entry", {
      id: "entry",
      kind: "user",
      subjectId: "actor",
      actions: ["*"],
      expiresAt: now,
    });
    await engine.process(event());
    expect(adapter.enforce).toHaveBeenCalledOnce();
  });
  it("does not trust bots implicitly or via user entries", async () => {
    const { engine, store, adapter } = fixture();
    vi.mocked(adapter.context).mockResolvedValue({
      ownerId: "owner",
      selfId: "self",
      roleIds: [],
      isBot: true,
    });
    store.put<WhitelistEntry>("guild", "whitelist", "entry", {
      id: "entry",
      kind: "user",
      subjectId: "actor",
      actions: ["*"],
    });
    await engine.process(event());
    expect(adapter.enforce).toHaveBeenCalledOnce();
  });
  it("guild settings and dedupe are isolated", async () => {
    const { engine, store, adapter } = fixture();
    const config = store.getConfig("guild");
    store.setConfig("other", config);
    await engine.process(event());
    await engine.process(event({ guildId: "other" }));
    expect(adapter.enforce).toHaveBeenCalledTimes(2);
  });
  it("actor dependency failure prevents moderation", async () => {
    const { engine, adapter } = fixture();
    vi.mocked(adapter.context).mockRejectedValue(
      new Error("Member fetch unavailable"),
    );
    expect((await engine.process(event()))?.status).toBe("failed");
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it("database failure prevents moderation", async () => {
    const { engine, store, adapter } = fixture();
    vi.spyOn(store, "put").mockImplementation(() => {
      throw new Error("disk full");
    });
    await expect(engine.process(event())).rejects.toThrow("disk full");
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it("hierarchy/API rejection is persisted, never retried as broad punishment", async () => {
    const { engine, adapter } = fixture();
    vi.mocked(adapter.enforce).mockRejectedValue(
      new Error("Role hierarchy prevents kick"),
    );
    const result = await engine.process(event());
    expect(result?.status).toBe("failed");
    expect(result?.result).toContain("hierarchy");
    await engine.process(event());
    expect(adapter.enforce).toHaveBeenCalledOnce();
  });
  it("log channel failure does not erase incident", async () => {
    const { engine, adapter, store } = fixture();
    vi.mocked(adapter.log).mockRejectedValue(new Error("channel deleted"));
    await engine.process(event());
    expect(store.list("guild", "incidents")).toHaveLength(1);
  });
  it("configuration change during actor fetch cancels enforcement", async () => {
    const { engine, adapter, store } = fixture();
    vi.mocked(adapter.context).mockImplementation(async () => {
      const c = store.getConfig("guild");
      c.mode = "monitor";
      store.setConfig("guild", c);
      return { ownerId: "owner", selfId: "self", roleIds: [], isBot: false };
    });
    await engine.process(event());
    expect(adapter.enforce).not.toHaveBeenCalled();
  });
  it("persists pending decision before the API effect", async () => {
    const { engine, adapter, store } = fixture();
    vi.mocked(adapter.enforce).mockImplementation(async () => {
      expect(
        store.get<{ status: string }>("guild", "incidents", "100")?.status,
      ).toBe("pending");
      return "done";
    });
    await engine.process(event());
  });
});
describe("audit correlation", () => {
  const options = { now: () => now, sleep: vi.fn(async () => {}) };
  it("retries delayed audit entry boundedly", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([event()]);
    expect(
      await correlateAudit(event({ source: "gateway" }), fetch, options),
    ).toEqual(event());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects concurrent ambiguous matches", async () => {
    expect(
      await correlateAudit(
        event({ source: "gateway", executorId: null }),
        async () => [event(), event({ id: "101", executorId: "other" })],
        options,
      ),
    ).toBeUndefined();
  });
  it.each([
    { targetId: "wrong" },
    { executorId: "wrong" },
    { auditAction: 10 },
    { guildId: "wrong" },
    { timestamp: now - 30001 },
  ])("rejects mismatched audit entry %o", async (changes) => {
    expect(
      await correlateAudit(
        event({ source: "gateway" }),
        async () => [event(changes)],
        options,
      ),
    ).toBeUndefined();
  });
  it("missing audit logs never prove kick", async () => {
    const fetch = vi.fn(async () => []);
    expect(
      await correlateAudit(
        event({ source: "gateway", action: "member.kick", auditAction: 20 }),
        fetch,
        options,
      ),
    ).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("handles API failures without unsafe attribution", async () => {
    expect(
      await correlateAudit(
        event(),
        async () => {
          throw new Error("429");
        },
        options,
      ),
    ).toBeUndefined();
  });
});
describe("dangerous permissions", () => {
  it("detects newly granted Administrator", () =>
    expect(dangerousPermissionGrant("0", "8")).toBe(true));
  it("does not classify removal as grant", () =>
    expect(dangerousPermissionGrant("8", "0")).toBe(false));
  it("does not classify unchanged danger as new escalation", () =>
    expect(dangerousPermissionGrant("8", "8")).toBe(false));
});
