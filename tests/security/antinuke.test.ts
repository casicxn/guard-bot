import { describe, expect, it, vi } from "vitest";
import { SqliteStore } from "../../src/database/index.js";
import { SecurityEngine } from "../../src/security/index.js";
import type {
  ActorContext,
  EnforcementAdapter,
  Incident,
  SecurityEvent,
} from "../../src/contracts.js";
import type {
  ContainmentResult,
  RollbackResult,
} from "../../src/security/antinuke-contracts.js";

const NOW = 1700000000000;
const contained: ContainmentResult = {
  status: "contained",
  removedRoleIds: ["danger"],
  remainingRoleIds: [],
  remainingPermissions: "0",
  reason: "Removed dangerous roles",
};
const restored: RollbackResult = {
  status: "succeeded",
  strategy: "delete-created",
  result: "Unauthorized resource deleted",
};
function event(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: "audit1",
    guildId: "guild",
    targetId: "channel",
    executorId: "attacker",
    action: "channel.create",
    auditAction: 10,
    source: "audit",
    timestamp: NOW,
    ...overrides,
  };
}
function fixture() {
  const store = new SqliteStore(":memory:");
  const config = store.getConfig("guild");
  config.mode = "protect";
  config.zeroTolerance = true;
  for (const policy of Object.values(config.modules)) {
    policy.enabled = false;
    policy.mode = "monitor";
    policy.action = "log";
    policy.threshold = 9999;
  }
  store.setConfig("guild", config);
  const actor: ActorContext = {
    ownerId: "guild-owner",
    selfId: "self",
    botOwnerId: "instance-owner",
    roleIds: [],
    isBot: false,
  };
  const adapter = {
    context: vi.fn(async () => ({ ...actor })),
    enforce: vi.fn(async () => "Legacy enforcement"),
    contain: vi.fn(async () => ({ ...contained })),
    rollback: vi.fn(
      async (_event: SecurityEvent, canContinue: () => Promise<boolean>) =>
        (await canContinue())
          ? { ...restored }
          : {
              status: "skipped" as const,
              strategy: "authorization",
              result: "Skipped",
            },
    ),
    log: vi.fn(async () => {}),
    observeTrusted: vi.fn(async () => {}),
  } satisfies EnforcementAdapter;
  const engine = new SecurityEngine(store, adapter, () => NOW);
  return {
    store,
    adapter,
    actor,
    engine,
    close: async () => {
      await engine.drain();
      store.close();
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("zero-tolerance administrative protection", () => {
  it("does not retroactively punish a delayed Monitor action delivered after Protect activation", async () => {
    const f = fixture();
    try {
      const config = f.store.getConfig("guild");
      config.protectionActivatedAt = NOW;
      f.store.setConfig("guild", config);
      const result = await f.engine.process(event({ timestamp: NOW - 1 }));
      await f.engine.drain();
      expect(result?.confidence).toBe("confirmed");
      expect(result?.result).toBe("Monitor only");
      expect(f.adapter.contain).not.toHaveBeenCalled();
      expect(f.adapter.rollback).not.toHaveBeenCalled();
      expect(f.store.get("guild", "recovery_guard", "main")).toBeUndefined();
    } finally {
      await f.close();
    }
  });
  it("cancels queued rollback after a newer Protect activation supersedes the incident", async () => {
    const f = fixture(),
      release = deferred<RollbackResult>();
    try {
      f.adapter.rollback.mockImplementationOnce(async (_event, canContinue) => {
        await release.promise;
        return (await canContinue())
          ? restored
          : {
              status: "skipped",
              strategy: "authorization",
              result: "Activation changed",
            };
      });
      await f.engine.process(event());
      const config = f.store.getConfig("guild");
      config.protectionActivatedAt = NOW + 1;
      f.store.setConfig("guild", config);
      release.resolve(restored);
      await f.engine.drain();
      expect(
        f.store.get<Incident>("guild", "incidents", "audit1")?.rollback?.status,
      ).toBe("skipped");
    } finally {
      release.resolve(restored);
      await f.close();
    }
  });
  it.each([
    ["thread.create", 110],
    ["thread.update", 111],
    ["invite.create", 40],
  ] as const)(
    "never contains normal self-service %s even with legacy active module settings",
    async (action, auditAction) => {
      const f = fixture();
      try {
        const config = f.store.getConfig("guild");
        config.modules[action] = {
          enabled: true,
          mode: "protect",
          action: "kick",
          threshold: 1,
          windowMs: 60000,
        };
        f.store.setConfig("guild", config);
        await f.engine.process(event({ action, auditAction }));
        await f.engine.drain();
        expect(f.adapter.contain).not.toHaveBeenCalled();
        expect(f.adapter.rollback).not.toHaveBeenCalled();
        expect(f.adapter.enforce).not.toHaveBeenCalled();
      } finally {
        await f.close();
      }
    },
  );
  it("contains and rolls back the first event despite disabled per-module preferences and large thresholds", async () => {
    const f = fixture();
    try {
      f.adapter.contain.mockImplementation(async () => {
        expect(
          f.store.get<Incident>("guild", "incidents", "audit1")?.status,
        ).toBe("pending");
        return contained;
      });
      await f.engine.process(event());
      await f.engine.drain();
      expect(f.adapter.contain).toHaveBeenCalledTimes(1);
      expect(f.adapter.rollback).toHaveBeenCalledTimes(1);
      expect(f.adapter.enforce).not.toHaveBeenCalled();
      expect(f.adapter.contain.mock.invocationCallOrder[0]).toBeLessThan(
        f.adapter.rollback.mock.invocationCallOrder[0]!,
      );
      expect(
        f.store.get<Incident>("guild", "incidents", "audit1"),
      ).toMatchObject({
        status: "handled",
        containment: { status: "contained" },
        rollback: { status: "succeeded" },
      });
      expect(f.store.get("guild", "recovery_guard", "main")).toMatchObject({
        blockedSince: NOW,
        eventId: "audit1",
      });
    } finally {
      await f.close();
    }
  });
  it("treats a single confirmed ban as sufficient without the old mass-action threshold", async () => {
    const f = fixture();
    try {
      await f.engine.process(
        event({ action: "member.ban", auditAction: 22, targetId: "victim" }),
      );
      await f.engine.drain();
      expect(f.adapter.contain).toHaveBeenCalledTimes(1);
      expect(f.adapter.rollback).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  });
  it("records monitor activity even for disabled administrative preferences without any effects", async () => {
    const f = fixture();
    try {
      const config = f.store.getConfig("guild");
      config.mode = "monitor";
      f.store.setConfig("guild", config);
      const result = await f.engine.process(event());
      await f.engine.drain();
      expect(result?.confidence).toBe("confirmed");
      expect(f.adapter.contain).not.toHaveBeenCalled();
      expect(f.adapter.rollback).not.toHaveBeenCalled();
      expect(f.adapter.enforce).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
  it.each(["guild-owner", "instance-owner", "self"])(
    "never punishes protected principal %s",
    async (executorId) => {
      const f = fixture();
      try {
        await f.engine.process(event({ executorId }));
        await f.engine.drain();
        expect(f.adapter.contain).not.toHaveBeenCalled();
        expect(f.adapter.rollback).not.toHaveBeenCalled();
        expect(f.adapter.observeTrusted).toHaveBeenCalledTimes(1);
        expect(f.store.get("guild", "recovery_guard", "main")).toBeUndefined();
      } finally {
        await f.close();
      }
    },
  );
  it.each(["user", "role", "bot"] as const)(
    "respects action-scoped %s trust",
    async (kind) => {
      const f = fixture();
      try {
        f.actor.isBot = kind === "bot";
        f.actor.roleIds = kind === "role" ? ["trusted-role"] : [];
        f.store.put("guild", "whitelist", "trust", {
          id: "trust",
          kind,
          subjectId: kind === "role" ? "trusted-role" : "attacker",
          actions: ["channel.create"],
        });
        await f.engine.process(event());
        await f.engine.drain();
        expect(f.adapter.contain).not.toHaveBeenCalled();
        expect(f.adapter.observeTrusted).toHaveBeenCalledTimes(1);
      } finally {
        await f.close();
      }
    },
  );
  it("does not automatically trust a bot or unrelated whitelist scope", async () => {
    const f = fixture();
    try {
      f.actor.isBot = true;
      f.store.put("guild", "whitelist", "trust", {
        id: "trust",
        kind: "bot",
        subjectId: "attacker",
        actions: ["role.update"],
      });
      await f.engine.process(event());
      await f.engine.drain();
      expect(f.adapter.contain).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  });
  it.each([
    { source: "gateway" as const, executorId: null },
    { auditAction: 12 },
    { timestamp: NOW - 60001 },
    { timestamp: NOW + 5001 },
  ])("never enforces unresolved or mismatched event %o", async (patch) => {
    const f = fixture();
    try {
      const result = await f.engine.process(event(patch));
      await f.engine.drain();
      expect(result?.confidence).toBe("unresolved");
      expect(f.adapter.contain).not.toHaveBeenCalled();
      expect(f.adapter.rollback).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
  it("deduplicates concurrent audit events and persists that decision across a restarted engine", async () => {
    const f = fixture();
    try {
      await Promise.all([
        f.engine.process(event()),
        f.engine.process(event()),
        f.engine.process(event()),
      ]);
      await f.engine.drain();
      const restarted = new SecurityEngine(f.store, f.adapter, () => NOW);
      expect(await restarted.process(event())).toBeUndefined();
      expect(f.adapter.contain).toHaveBeenCalledTimes(1);
      expect(f.adapter.rollback).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  });
  it("contains another attacker while the first rollback is still waiting", async () => {
    const f = fixture(),
      slow = deferred<RollbackResult>();
    try {
      f.adapter.rollback.mockImplementationOnce(async () => slow.promise);
      await f.engine.process(event());
      for (let i = 0; i < 12; i++) await Promise.resolve();
      await f.engine.process(
        event({ id: "audit2", executorId: "attacker2", targetId: "other" }),
      );
      expect(f.adapter.contain).toHaveBeenCalledTimes(2);
      slow.resolve(restored);
      await f.engine.drain();
    } finally {
      slow.resolve(restored);
      await f.close();
    }
  });
  it("does not block the next containment on slow Discord notification delivery", async () => {
    const f = fixture(),
      delivery = deferred<void>();
    try {
      f.adapter.log.mockImplementation(async () => delivery.promise);
      await f.engine.process(event());
      await f.engine.process(
        event({ id: "audit2", executorId: "attacker2", targetId: "other" }),
      );
      expect(f.adapter.contain).toHaveBeenCalledTimes(2);
      delivery.resolve();
      await f.engine.drain();
    } finally {
      delivery.resolve();
      await f.close();
    }
  });
  it("rechecks current mode before queued rollback effects", async () => {
    const f = fixture(),
      release = deferred<RollbackResult>();
    try {
      f.adapter.rollback.mockImplementationOnce(async (_event, canContinue) => {
        await release.promise;
        return (await canContinue())
          ? restored
          : {
              status: "skipped",
              strategy: "authorization",
              result: "Mode changed",
            };
      });
      await f.engine.process(event());
      const config = f.store.getConfig("guild");
      config.mode = "monitor";
      f.store.setConfig("guild", config);
      release.resolve(restored);
      await f.engine.drain();
      expect(
        f.store.get<Incident>("guild", "incidents", "audit1")?.rollback?.status,
      ).toBe("skipped");
    } finally {
      release.resolve(restored);
      await f.close();
    }
  });
  it("still attempts safe rollback after containment fails, and reports degraded protection", async () => {
    const f = fixture();
    try {
      f.adapter.contain.mockRejectedValueOnce(new Error("Hierarchy"));
      await f.engine.process(event());
      await f.engine.drain();
      expect(f.adapter.rollback).toHaveBeenCalledTimes(1);
      expect(
        f.store.get<Incident>("guild", "incidents", "audit1"),
      ).toMatchObject({
        status: "degraded",
        event: { severity: "critical" },
        containment: { status: "failed" },
      });
    } finally {
      await f.close();
    }
  });
  it("rechecks whitelist after asynchronous actor lookup immediately before containment", async () => {
    const f = fixture();
    try {
      f.adapter.context.mockImplementation(async () => {
        f.store.put("guild", "whitelist", "late", {
          id: "late",
          kind: "user",
          subjectId: "attacker",
          actions: ["channel.create"],
        });
        return f.actor;
      });
      await f.engine.process(event());
      await f.engine.drain();
      expect(f.adapter.contain).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
});
