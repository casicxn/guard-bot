import { describe, it, expect, vi } from "vitest";
import { SqliteStore } from "../../src/database/index.js";
import { createRestartProtection } from "../../src/restart/index.js";
import type {
  RestartAdapter,
  RestartGuild,
  RestartRole,
} from "../../src/restart/adapter.js";
import type { Logger } from "pino";
import type { OwnerAuthorization } from "../../src/control/contracts.js";
import { PermissionFlagsBits } from "discord.js";
const OWNER = "owner",
  DANGER = PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles,
  HARMLESS = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;
const role = (overrides: Partial<RestartRole> = {}): RestartRole => ({
  id: "role",
  name: "Moderator",
  permissions: (DANGER | HARMLESS).toString(),
  position: 5,
  managed: false,
  editable: true,
  botHeld: false,
  ownBotManaged: false,
  ...overrides,
});
function fixture() {
  const store = new SqliteStore(":memory:"),
    roles = new Map<string, RestartRole>([["role", role()]]);
  const auth = {
    assertOwner: vi.fn((id: string) => {
      if (id !== OWNER) throw new Error("Denied");
    }),
    isBotOwner: (id: string) => id === OWNER,
    requireBotOwner: vi.fn(),
  } as unknown as OwnerAuthorization;
  let manageable = true,
    ready = true,
    risks: string[] = [],
    highest = 10;
  const adapter: RestartAdapter = {
    inspect: vi.fn(async (guildId: string): Promise<RestartGuild> => ({
      id: guildId,
      botId: "bot",
      ownerId: "guild-owner",
      manageRoles: manageable,
      botPermissions: PermissionFlagsBits.Administrator.toString(),
      botHighestPosition: highest,
      roles: [...roles.values()].map((r) => ({ ...r })),
      overwriteRisks: risks,
    })),
    readRole: vi.fn(async (_guildId, id) =>
      roles.get(id) ? { ...roles.get(id)! } : undefined,
    ),
    setPermissions: vi.fn(async (_guildId, id, permissions) => {
      const current = roles.get(id);
      if (current) roles.set(id, { ...current, permissions });
    }),
    roleContainsContained: vi.fn(async () => false),
  };
  const logger = { info: vi.fn(), warn: vi.fn() } as unknown as Logger;
  const options = { guardReady: vi.fn(async () => ready) };
  const manager = () =>
    createRestartProtection(store, auth, adapter, logger, options);
  const service = manager();
  const config = store.getConfig("guild");
  config.mode = "protect";
  store.setConfig("guild", config);
  return {
    store,
    roles,
    auth,
    adapter,
    logger,
    options,
    service,
    manager,
    setReady: (value: boolean) => {
      ready = value;
    },
    setManageable: (value: boolean) => {
      manageable = value;
    },
    setRisks: (value: string[]) => {
      risks = value;
    },
    setHighest: (value: number) => {
      highest = value;
    },
  };
}
describe("journaled planned restart permission lockdown", () => {
  it("rejects a plan whose removed permissions Guard cannot grant back", async () => {
    const f = fixture();
    try {
      const live = await f.adapter.inspect("guild");
      vi.mocked(f.adapter.inspect).mockResolvedValue({
        ...live,
        botPermissions: PermissionFlagsBits.ManageRoles.toString(),
      });
      const session = await f.service.prepare(OWNER, "guild");
      expect(session.canActivate).toBe(false);
      expect(session.risks).toContain("cannot-restore:role");
      await expect(
        f.service.activate(OWNER, "guild", session.id),
      ).rejects.toThrow();
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("rechecks restoration capability after a prepared plan is confirmed", async () => {
    const f = fixture();
    try {
      const session = await f.service.prepare(OWNER, "guild");
      const live = await f.adapter.inspect("guild");
      vi.mocked(f.adapter.inspect).mockResolvedValue({
        ...live,
        botPermissions: PermissionFlagsBits.ManageRoles.toString(),
      });
      await expect(
        f.service.activate(OWNER, "guild", session.id),
      ).rejects.toThrow();
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("prepares durable decimal snapshots without mutating role/member permissions", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      expect(s.state).toBe("SNAPSHOTTING");
      expect(s.roles[0]).toMatchObject({
        originalPermissions: (DANGER | HARMLESS).toString(),
        removedPermissions: DANGER.toString(),
        lockedPermissions: HARMLESS.toString(),
        status: "planned",
      });
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      expect(f.store.get("guild", "restart_plans", s.id)).toBeDefined();
      expect(f.service.get("guild")?.id).toBe(s.id);
    } finally {
      f.store.close();
    }
  });
  it("locks only dangerous flags then restores after Guard readiness preserving mode", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      expect((await f.service.activate(OWNER, "guild", s.id)).state).toBe(
        "LOCKED",
      );
      expect(f.roles.get("role")?.permissions).toBe(HARMLESS.toString());
      expect((await f.service.restore(OWNER, "guild", s.id)).state).toBe(
        "COMPLETED",
      );
      expect(f.roles.get("role")?.permissions).toBe(
        (DANGER | HARMLESS).toString(),
      );
      expect(f.store.getConfig("guild").mode).toBe("protect");
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(2);
    } finally {
      f.store.close();
    }
  });
  it("requires owner authorization at every mutation boundary", async () => {
    const f = fixture();
    try {
      expect(() => f.service.prepare("attacker", "guild")).toThrow();
      const s = await f.service.prepare(OWNER, "guild");
      expect(() => f.service.activate("attacker", "guild", s.id)).toThrow();
      expect(() => f.service.restore("attacker", "guild", s.id)).toThrow();
      expect(() => f.service.cancel("attacker", "guild", s.id)).toThrow();
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("retains lockdown when Guard is unavailable then allows an explicit safe recovery", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", s.id);
      f.setReady(false);
      expect((await f.manager().recover("guild"))?.state).toBe(
        "MANUAL_RECOVERY_REQUIRED",
      );
      expect(f.roles.get("role")?.permissions).toBe(HARMLESS.toString());
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(1);
      f.setReady(true);
      expect((await f.service.restore(OWNER, "guild", s.id)).state).toBe(
        "COMPLETED",
      );
    } finally {
      f.store.close();
    }
  });
  it("rejects missing permission preflight activation without API mutations", async () => {
    const f = fixture();
    try {
      f.setManageable(false);
      const s = await f.service.prepare(OWNER, "guild");
      expect(s.canActivate).toBe(false);
      await expect(f.service.activate(OWNER, "guild", s.id)).rejects.toThrow();
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it.each([
    { managed: true },
    { editable: false },
    { position: 11 },
    { botHeld: true },
  ])(
    "reports unmanageable or bot-held role gaps without changing them: %j",
    async (patch) => {
      const f = fixture();
      try {
        f.roles.set("role", role(patch));
        const s = await f.service.prepare(OWNER, "guild");
        expect(s.roles[0]?.manageable).toBe(false);
        expect((await f.service.activate(OWNER, "guild", s.id)).state).toBe(
          "PARTIAL_FAILURE",
        );
        expect(f.adapter.setPermissions).not.toHaveBeenCalled();
      } finally {
        f.store.close();
      }
    },
  );
  it("retains the current bot integration role without claiming its owner is locked", async () => {
    const f = fixture();
    try {
      f.roles.set(
        "self",
        role({ id: "self", managed: true, botHeld: true, ownBotManaged: true }),
      );
      const s = await f.service.prepare(OWNER, "guild");
      expect(s.roles.map((r) => r.roleId)).toEqual(["role"]);
      expect(s.risks).toContain("owner-unrestricted");
      expect((await f.service.activate(OWNER, "guild", s.id)).state).toBe(
        "LOCKED",
      );
      expect(f.roles.get("self")?.permissions).toBe(
        (DANGER | HARMLESS).toString(),
      );
    } finally {
      f.store.close();
    }
  });
  it("reports dangerous channel overrides as incomplete coverage rather than full lockdown", async () => {
    const f = fixture();
    try {
      f.setRisks(["overwrite:channel:member"]);
      const s = await f.service.prepare(OWNER, "guild");
      expect((await f.service.activate(OWNER, "guild", s.id)).state).toBe(
        "PARTIAL_FAILURE",
      );
      expect(s.risks).toContain("overwrite:channel:member");
    } finally {
      f.store.close();
    }
  });
  it("refuses a stale role plan or newly dangerous role instead of overwriting changes", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      f.roles.set(
        "role",
        role({
          permissions: (
            DANGER |
            HARMLESS |
            PermissionFlagsBits.ReadMessageHistory
          ).toString(),
        }),
      );
      await expect(f.service.activate(OWNER, "guild", s.id)).rejects.toThrow();
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("treats unexpected concurrent restoration changes as conflicts preserving them", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", s.id);
      const modified = (
        HARMLESS | PermissionFlagsBits.ReadMessageHistory
      ).toString();
      f.roles.set("role", role({ permissions: modified }));
      const result = await f.service.restore(OWNER, "guild", s.id);
      expect(result.state).toBe("MANUAL_RECOVERY_REQUIRED");
      expect(result.roles[0]?.status).toBe("conflict");
      expect(f.roles.get("role")?.permissions).toBe(modified);
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(1);
    } finally {
      f.store.close();
    }
  });
  it("reconciles a lock accepted before crash without repeating its request", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", s.id);
      const key = `${s.id}:lock:role`,
        op = f.store.get<Record<string, unknown>>(
          "guild",
          "restart_operations",
          key,
        )!;
      op.status = "pending";
      delete op.applied;
      f.store.put("guild", "restart_operations", key, op);
      const restored = await f.manager().recover("guild");
      expect(restored?.state).toBe("COMPLETED");
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(2);
    } finally {
      f.store.close();
    }
  });
  it("does not replay an uncertain restore when live state still equals locked", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", s.id);
      vi.mocked(f.adapter.setPermissions).mockRejectedValueOnce(
        new Error("Network timeout"),
      );
      expect((await f.service.restore(OWNER, "guild", s.id)).state).toBe(
        "MANUAL_RECOVERY_REQUIRED",
      );
      expect((await f.manager().recover("guild"))?.state).toBe(
        "MANUAL_RECOVERY_REQUIRED",
      );
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(2);
      expect(f.roles.get("role")?.permissions).toBe(HARMLESS.toString());
    } finally {
      f.store.close();
    }
  });
  it("verifies a mutation accepted despite network rejection", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      vi.mocked(f.adapter.setPermissions).mockImplementationOnce(
        async (_guild, id, permissions) => {
          f.roles.set(id, role({ permissions }));
          throw new Error("Connection dropped after acceptance");
        },
      );
      expect((await f.service.activate(OWNER, "guild", s.id)).state).toBe(
        "LOCKED",
      );
      expect(f.service.get("guild")?.roles[0]?.status).toBe("locked");
    } finally {
      f.store.close();
    }
  });
  it("does not rearm a contained attacker through restored shared permissions", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", s.id);
      f.store.put("guild", "containment_records", "attacker", {
        executorId: "attacker",
        status: "contained",
      });
      vi.mocked(f.adapter.roleContainsContained).mockResolvedValue(true);
      expect(
        (await f.service.restore(OWNER, "guild", s.id)).roles[0]?.status,
      ).toBe("conflict");
      expect(f.adapter.roleContainsContained).toHaveBeenCalledWith(
        "guild",
        "role",
        ["attacker"],
      );
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(1);
    } finally {
      f.store.close();
    }
  });
  it("keeps missing roles and impossible hierarchy restorations available for manual recovery", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", s.id);
      f.roles.delete("role");
      const result = await f.service.restore(OWNER, "guild", s.id);
      expect(result.state).toBe("MANUAL_RECOVERY_REQUIRED");
      expect(result.roles[0]?.status).toBe("missing");
    } finally {
      f.store.close();
    }
  });
  it("cancels an untouched plan without granting or deleting recorded permissions", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      expect((await f.service.cancel(OWNER, "guild", s.id)).state).toBe(
        "COMPLETED",
      );
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
      expect(f.store.get("guild", "restart_sessions", s.id)).toBeDefined();
    } finally {
      f.store.close();
    }
  });
  it("deduplicates activation and automatic startup recovery concurrently", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      await Promise.all([
        f.service.activate(OWNER, "guild", s.id),
        f.service.activate(OWNER, "guild", s.id),
      ]);
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(1);
      const restart = f.manager();
      const p = restart.recover("guild");
      expect(restart.recover("guild")).toBe(p);
      await p;
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(2);
    } finally {
      f.store.close();
    }
  });
  it("rejects tampered permission masks, plan hashes and foreign session IDs", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      const raw = structuredClone(s);
      raw.roles[0]!.originalPermissions = (
        DANGER |
        HARMLESS |
        PermissionFlagsBits.Administrator
      ).toString();
      f.store.put("guild", "restart_sessions", s.id, raw);
      expect(() => f.service.get("guild")).toThrow();
      await expect(f.service.restore(OWNER, "guild", s.id)).rejects.toThrow();
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("checks guild-scoped session references and preserves unrelated settings", async () => {
    const f = fixture();
    try {
      const s = await f.service.prepare(OWNER, "guild");
      expect(f.service.get("other")).toBeUndefined();
      await expect(f.service.activate(OWNER, "other", s.id)).rejects.toThrow();
      const other = await f.service.prepare(OWNER, "other");
      expect(other.id).not.toBe(s.id);
      expect(f.service.get("guild")?.id).toBe(s.id);
    } finally {
      f.store.close();
    }
  });
});

describe("crash boundaries and last-moment guards", () => {
  it("reconciles restoration accepted before the durable success update without replay", async () => {
    const f = fixture();
    try {
      const session = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", session.id);
      const put = f.store.put.bind(f.store);
      let fail = true;
      const spy = vi
        .spyOn(f.store, "put")
        .mockImplementation((guild, collection, id, value) => {
          const op = value as { kind?: string; status?: string };
          if (
            fail &&
            collection === "restart_operations" &&
            op.kind === "restore" &&
            op.status === "verified"
          ) {
            fail = false;
            throw new Error("Disk failed after Discord accepted restoration");
          }
          put(guild, collection, id, value);
        });
      await expect(
        f.service.restore(OWNER, "guild", session.id),
      ).rejects.toThrow("Disk failed");
      spy.mockRestore();
      expect(f.roles.get("role")?.permissions).toBe(
        (DANGER | HARMLESS).toString(),
      );
      expect((await f.manager().recover("guild"))?.state).toBe("COMPLETED");
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(2);
    } finally {
      f.store.close();
    }
  });
  it("rechecks Guard readiness after asynchronous contained-principal lookup", async () => {
    const f = fixture();
    try {
      const session = await f.service.prepare(OWNER, "guild");
      await f.service.activate(OWNER, "guild", session.id);
      vi.mocked(f.adapter.roleContainsContained).mockImplementation(
        async () => {
          f.setReady(false);
          return false;
        },
      );
      const result = await f.service.restore(OWNER, "guild", session.id);
      expect(result.state).toBe("MANUAL_RECOVERY_REQUIRED");
      expect(f.roles.get("role")?.permissions).toBe(HARMLESS.toString());
      expect(f.adapter.setPermissions).toHaveBeenCalledTimes(1);
    } finally {
      f.store.close();
    }
  });
  it("stops before any external effect when durable pending-journal storage fails", async () => {
    const f = fixture();
    try {
      const session = await f.service.prepare(OWNER, "guild");
      const put = f.store.put.bind(f.store);
      const spy = vi
        .spyOn(f.store, "put")
        .mockImplementation((guild, collection, id, value) => {
          if (collection === "restart_operations")
            throw new Error("Disk unavailable");
          put(guild, collection, id, value);
        });
      await expect(
        f.service.activate(OWNER, "guild", session.id),
      ).rejects.toThrow("Disk unavailable");
      expect(f.adapter.setPermissions).not.toHaveBeenCalled();
      spy.mockRestore();
    } finally {
      f.store.close();
    }
  });
});
