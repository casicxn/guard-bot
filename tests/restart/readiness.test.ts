import { describe, it, expect } from "vitest";
import { Client, GatewayIntentBits } from "discord.js";
import { SqliteStore } from "../../src/database/index.js";
import { restartGuardReady } from "../../src/control/restart.js";
import { testControls } from "../helpers/controls.js";
function setup() {
  const store = new SqliteStore(":memory:");
  let allowed = true;
  const client = {
    isReady: () => true,
    options: {
      intents: new Set([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
    guilds: {
      fetch: async () => ({
        members: {
          fetchMe: async () => ({ permissions: { has: () => allowed } }),
        },
      }),
    },
  } as unknown as Client;
  const config = store.getConfig("guild");
  config.mode = "protect";
  config.modules["channel.delete"] = {
    ...config.modules["channel.delete"]!,
    enabled: true,
    mode: "protect",
    action: "strip",
  };
  store.setConfig("guild", config);
  return {
    store,
    client,
    authorization: testControls().authorization,
    setPermissions: (value: boolean) => {
      allowed = value;
    },
  };
}
describe("permission restoration readiness gate", () => {
  it("requires an installed engine, Protect mode and fresh available audit/enforcement permissions", async () => {
    const f = setup();
    try {
      expect(
        await restartGuardReady(
          f.client,
          f.store,
          f.authorization,
          "guild",
          () => false,
        ),
      ).toBe(false);
      expect(
        await restartGuardReady(
          f.client,
          f.store,
          f.authorization,
          "guild",
          () => true,
        ),
      ).toBe(true);
      f.setPermissions(false);
      expect(
        await restartGuardReady(
          f.client,
          f.store,
          f.authorization,
          "guild",
          () => true,
        ),
      ).toBe(false);
      f.setPermissions(true);
      const config = f.store.getConfig("guild");
      config.mode = "monitor";
      f.store.setConfig("guild", config);
      expect(
        await restartGuardReady(
          f.client,
          f.store,
          f.authorization,
          "guild",
          () => true,
        ),
      ).toBe(false);
    } finally {
      f.store.close();
    }
  });
  it("requires a trusted recovery baseline for zero-tolerance protection", async () => {
    const f = setup();
    try {
      const config = f.store.getConfig("guild");
      config.zeroTolerance = true;
      f.store.setConfig("guild", config);
      expect(
        await restartGuardReady(
          f.client,
          f.store,
          f.authorization,
          "guild",
          () => true,
        ),
      ).toBe(false);
    } finally {
      f.store.close();
    }
  });
});
