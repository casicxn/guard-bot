import { describe, it, expect, vi } from "vitest";
import type { Logger } from "pino";
import type {
  BackupService,
  GuildConfig,
  Incident,
  Store,
} from "../../src/contracts.js";
import { AuthorizationService } from "../../src/control/authorization.js";
import {
  ownerGuildStore,
  ownerBackupService,
  assertManagementActor,
} from "../../src/control/access.js";
const OWNER = "999999999999999999",
  OTHER = "888888888888888888";
function fixture() {
  const config: GuildConfig = {
    language: "tr",
    mode: "monitor",
    modules: {},
    incidentRetentionDays: 30,
    backupRetention: 10,
    backupIntervalHours: 0,
    lockdown: false,
  };
  const store = {
    getConfig: vi.fn(() => config),
    setConfig: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    list: vi.fn(() => []),
    delete: vi.fn(),
    claim: vi.fn(() => true),
    claimIncident: vi.fn(() => true),
    close: vi.fn(),
  } as unknown as Store;
  const auth = new AuthorizationService(OWNER, store, {
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger);
  const backup = {
    create: vi.fn(async () => ({ id: "snapshot" })),
    list: vi.fn(() => []),
    preview: vi.fn(async () => "preview"),
    restore: vi.fn(async () => "result"),
  } as BackupService;
  return { config, store, auth, backup };
}
describe("authorized configuration repository boundary", () => {
  it("rejects unauthorized direct configuration service access before touching storage", () => {
    const { store, auth } = fixture();
    expect(() => ownerGuildStore(store, auth, OTHER, "guild")).toThrow();
    expect(store.getConfig).not.toHaveBeenCalled();
    expect(store.setConfig).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });
  it("permits the same configured owner across independent guild scopes", () => {
    const { store, auth, config } = fixture();
    ownerGuildStore(store, auth, OWNER, "a").setConfig("a", config);
    ownerGuildStore(store, auth, OWNER, "b").setConfig("b", config);
    expect(store.setConfig).toHaveBeenNthCalledWith(1, "a", config);
    expect(store.setConfig).toHaveBeenNthCalledWith(2, "b", config);
  });
  it("rejects forged cross-guild reads and mutations including incident claims", () => {
    const { store, auth, config } = fixture();
    const scoped = ownerGuildStore(store, auth, OWNER, "a");
    for (const attempt of [
      () => scoped.getConfig("b"),
      () => scoped.setConfig("b", config),
      () => scoped.get("b", "config", "main"),
      () => scoped.put("b", "config", "main", config),
      () => scoped.list("b", "whitelist"),
      () => scoped.delete("b", "whitelist", "entry"),
      () => scoped.claim("b", "key"),
      () => scoped.claimIncident!({ guildId: "b" } as Incident),
    ])
      expect(attempt).toThrow();
    expect(store.put).not.toHaveBeenCalled();
    expect(store.claimIncident).not.toHaveBeenCalled();
  });
  it("delegates allowed guild data access without exposing close", () => {
    const { store, auth, config } = fixture();
    const scoped = ownerGuildStore(store, auth, OWNER, "a");
    expect(scoped.getConfig("a")).toBe(config);
    scoped.put("a", "whitelist", "entry", { id: "entry" });
    scoped.list("a", "whitelist", 5, 10);
    scoped.delete("a", "whitelist", "entry");
    expect(scoped.claim("a", "key")).toBe(true);
    expect(store.list).toHaveBeenCalledWith("a", "whitelist", 5, 10);
    expect(() => scoped.close()).toThrow();
    expect(store.close).not.toHaveBeenCalled();
  });
  it("revalidates central authorization on every scoped call", () => {
    const { store, auth } = fixture();
    const check = vi.spyOn(auth, "assertOwner");
    const scoped = ownerGuildStore(store, auth, OWNER, "guild");
    check.mockImplementationOnce(() => {
      throw new Error("denied");
    });
    expect(() => scoped.put("guild", "settings", "x", {})).toThrow("denied");
    expect(store.put).not.toHaveBeenCalled();
  });
  it("requires an explicitly supplied management actor", () => {
    const { auth } = fixture();
    expect(() =>
      assertManagementActor({ userId: OTHER, authorization: auth }),
    ).toThrow();
    expect(() =>
      assertManagementActor({ userId: OWNER, authorization: auth }),
    ).not.toThrow();
    expect(() => assertManagementActor(undefined as never)).toThrow();
  });
});
describe("owner-only manual backup service boundary", () => {
  it("denies direct unauthorized backup management without affecting automatic service", async () => {
    const { backup, auth } = fixture();
    expect(() => ownerBackupService(backup, auth, OTHER, "a")).toThrow();
    expect(backup.create).not.toHaveBeenCalled();
    await backup.create("a");
    expect(backup.create).toHaveBeenCalledOnce();
  });
  it("validates scope for backup reads and restore writes", async () => {
    const { backup, auth } = fixture();
    const scoped = ownerBackupService(backup, auth, OWNER, "a");
    await expect(scoped.create("b")).rejects.toThrow();
    expect(() => scoped.list("b")).toThrow();
    await expect(scoped.preview("b", "id")).rejects.toThrow();
    await expect(scoped.restore("b", "id")).rejects.toThrow();
    expect(backup.restore).not.toHaveBeenCalled();
  });
  it("delegates authorized creation, previews and restoration", async () => {
    const { backup, auth } = fixture();
    const scoped = ownerBackupService(backup, auth, OWNER, "a");
    expect(await scoped.create("a")).toEqual({ id: "snapshot" });
    scoped.list("a");
    expect(await scoped.preview("a", "id", "roles")).toBe("preview");
    expect(await scoped.restore("a", "id", "channels")).toBe("result");
    expect(backup.restore).toHaveBeenCalledWith("a", "id", "channels");
  });
});
