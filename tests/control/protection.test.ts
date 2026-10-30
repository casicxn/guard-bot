import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayIntentBits,
  IntentsBitField,
  PermissionFlagsBits,
  type Client,
} from "discord.js";
import { SqliteStore } from "../../src/database/index.js";
import { createProtectionControl } from "../../src/control/protection.js";
import { MODULES } from "../../src/security/modules.js";
import type { OwnerAuthorization } from "../../src/control/contracts.js";
import type { ModuleConfig } from "../../src/contracts.js";
import { prepareProtectionBaseline } from "../../src/recovery/known-good.js";
vi.mock("../../src/recovery/known-good.js", () => ({
  prepareProtectionBaseline: vi.fn(async () => {}),
  findKnownGoodSnapshot: vi.fn(() => undefined),
}));
const owner = "999999999999999999",
  guildId = "123456789012345678";
const stores: SqliteStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
beforeEach(() =>
  vi.mocked(prepareProtectionBaseline).mockReset().mockResolvedValue(undefined),
);
function fixture(allowed: (permission: bigint) => boolean = () => true) {
  const store = new SqliteStore(":memory:");
  stores.push(store);
  const fetchMe = vi.fn(async () => ({ permissions: { has: allowed } }));
  const fetch = vi.fn(async () => ({ members: { fetchMe } }));
  const client = {
    guilds: { fetch },
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
  } as unknown as Client;
  const authorization: OwnerAuthorization = {
    isBotOwner: (id) => id === owner,
    assertOwner: (id) => {
      if (id !== owner) throw new Error("Denied");
    },
    requireBotOwner: async () => false,
  };
  return {
    store,
    client,
    fetch,
    fetchMe,
    service: createProtectionControl(client, store, authorization),
  };
}
describe("central one-click protection", () => {
  it("lets Monitor cancel a pending baseline activation without waiting for snapshot network calls", async () => {
    const f = fixture();
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(prepareProtectionBaseline).mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const activation = f.service.setMode(owner, guildId, "protect");
    await started;
    await f.service.setMode(owner, guildId, "monitor");
    expect(f.store.getConfig(guildId).mode).toBe("monitor");
    finish();
    await expect(activation).rejects.toMatchObject({ key: "control.stale" });
    expect(f.store.getConfig(guildId).mode).toBe("monitor");
  });
  it("activates every eligible audit module on its first action and preserves original preferences", async () => {
    const f = fixture(),
      config = f.store.getConfig(guildId);
    const original = structuredClone(config.modules);
    for (const policy of Object.values(config.modules)) {
      policy.enabled = false;
      policy.threshold = 9;
      policy.action = "log";
    }
    f.store.setConfig(guildId, config);
    const previous = structuredClone(config.modules);
    await f.service.setMode(
      owner,
      guildId,
      "protect",
      JSON.stringify(f.store.getConfig(guildId)),
    );
    const result = f.store.getConfig(guildId);
    expect(result).toMatchObject({ mode: "protect", zeroTolerance: true });
    for (const module of MODULES.filter((module) => module.administrative))
      expect(result.modules[module.id]).toMatchObject({
        enabled: true,
        mode: "protect",
        threshold: 1,
        action: "strip",
      });
    expect(result.modules["raid.join"]?.enabled).toBe(false);
    for (const id of [
      "invite.create",
      "invite.update",
      "thread.create",
      "thread.update",
      "raid.join",
    ])
      expect(result.modules[id]).toMatchObject({
        enabled: false,
        mode: "monitor",
        threshold: 9,
        action: "log",
      });
    expect(
      f.store.get<{ modules: Record<string, ModuleConfig> }>(
        guildId,
        "protection_preferences",
        "main",
      )?.modules,
    ).toEqual(previous);
    expect(original["member.ban"]?.threshold).toBe(5);
    expect(prepareProtectionBaseline).toHaveBeenCalledTimes(1);
  });
  it("switches to Monitor without losing saved preferences or disabling administrative observations", async () => {
    const f = fixture(),
      config = f.store.getConfig(guildId);
    config.modules["channel.create"] = {
      enabled: false,
      mode: "protect",
      threshold: 7,
      windowMs: 20000,
      action: "warn",
    };
    f.store.setConfig(guildId, config);
    await f.service.setMode(owner, guildId, "protect");
    await f.service.setMode(owner, guildId, "monitor");
    expect(f.store.getConfig(guildId)).toMatchObject({
      mode: "monitor",
      zeroTolerance: true,
    });
    expect(f.store.getConfig(guildId).modules["channel.create"]).toEqual({
      enabled: true,
      mode: "monitor",
      threshold: 7,
      windowMs: 20000,
      action: "warn",
    });
    const changed = f.store.getConfig(guildId);
    changed.modules["channel.create"]!.threshold = 12;
    f.store.setConfig(guildId, changed);
    await f.service.setMode(owner, guildId, "protect");
    await f.service.setMode(owner, guildId, "monitor");
    expect(
      f.store.getConfig(guildId).modules["channel.create"]?.threshold,
    ).toBe(12);
    expect(
      f.store.get<{ originalModules: Record<string, ModuleConfig> }>(
        guildId,
        "protection_preferences",
        "main",
      )?.originalModules["channel.create"]?.enabled,
    ).toBe(false);
  });
  it("does not overwrite preferences on repeated Protect activation", async () => {
    const f = fixture();
    await f.service.setMode(owner, guildId, "protect");
    const previous = f.store.get(guildId, "protection_preferences", "main");
    await f.service.setMode(owner, guildId, "protect");
    expect(f.store.get(guildId, "protection_preferences", "main")).toEqual(
      previous,
    );
    expect(prepareProtectionBaseline).toHaveBeenCalledTimes(1);
  });
  it("rejects unauthorized calls before network, snapshot or config access", async () => {
    const f = fixture();
    await expect(
      f.service.setMode("admin", guildId, "protect"),
    ).rejects.toThrow("Denied");
    expect(f.fetch).not.toHaveBeenCalled();
    expect(prepareProtectionBaseline).not.toHaveBeenCalled();
    expect(f.store.getConfig(guildId).mode).toBe("monitor");
  });
  it("rejects stale confirmations without changing the newer configuration", async () => {
    const f = fixture(),
      expected = JSON.stringify(f.store.getConfig(guildId)),
      next = f.store.getConfig(guildId);
    next.notificationsEnabled = false;
    f.store.setConfig(guildId, next);
    await expect(
      f.service.setMode(owner, guildId, "protect", expected),
    ).rejects.toMatchObject({ key: "control.stale" });
    expect(prepareProtectionBaseline).not.toHaveBeenCalled();
    expect(f.store.getConfig(guildId)).toMatchObject({
      mode: "monitor",
      notificationsEnabled: false,
    });
  });
  it("rechecks fresh configuration after asynchronous baseline capture even without an expected value", async () => {
    const f = fixture();
    vi.mocked(prepareProtectionBaseline).mockImplementationOnce(async () => {
      const config = f.store.getConfig(guildId);
      config.language = "en";
      f.store.setConfig(guildId, config);
    });
    await expect(
      f.service.setMode(owner, guildId, "protect"),
    ).rejects.toMatchObject({ key: "control.stale" });
    expect(f.store.getConfig(guildId)).toMatchObject({
      mode: "monitor",
      language: "en",
    });
  });
  it("keeps Protect active with honest module-specific degradation and unavailable baseline", async () => {
    const f = fixture(
      (permission) => permission !== PermissionFlagsBits.ManageChannels,
    );
    vi.mocked(prepareProtectionBaseline).mockRejectedValueOnce(
      new Error("No trusted baseline"),
    );
    const health = await f.service.setMode(owner, guildId, "protect");
    expect(health.mode).toBe("protect");
    expect(health.snapshotReady).toBe(false);
    expect(
      health.unavailable.some(
        (module) =>
          module.id === "channel.create" &&
          module.missing.includes("ManageChannels"),
      ),
    ).toBe(true);
    expect(
      health.modules.find((module) => module.id === "member.role")?.available,
    ).toBe(true);
    expect(health.active).toBeLessThan(health.eligible);
  });
  it("reports unavailable protections when authoritative permission reads fail", async () => {
    const f = fixture();
    f.fetchMe.mockRejectedValueOnce(new Error("Missing access"));
    const health = await f.service.health(guildId);
    expect(health.auditReady).toBe(false);
    expect(health.unavailable).toHaveLength(health.eligible);
    expect(health.active).toBe(0);
  });
});
