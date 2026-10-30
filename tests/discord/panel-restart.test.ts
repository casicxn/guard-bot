import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ChannelType,
  IntentsBitField,
  GatewayIntentBits,
  type Client,
} from "discord.js";
import type { Logger } from "pino";
import { SqliteStore } from "../../src/database/index.js";
import {
  createPermanentPanel,
  type PermanentPanelRecord,
} from "../../src/discord/permanent-panel.js";
import { Sessions } from "../../src/discord/sessions.js";
import { testControls } from "../helpers/controls.js";
const GUILD = "123456789012345678",
  CHANNEL = "223456789012345678",
  MESSAGE = "323456789012345678",
  BOT = "423456789012345678";
const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
});
function fixture(recoveryBehavior?: "manual" | "replace") {
  const store = new SqliteStore(":memory:");
  const record: PermanentPanelRecord = {
    version: 1,
    panelChannelId: CHANNEL,
    panelMessageId: MESSAGE,
    panelCreatedAt: 123,
    panelEnabled: true,
    panelLanguage: "tr",
    status: "ready",
    recoveryBehavior,
  };
  store.put(GUILD, "permanent_panel", "main", record);
  const original = {
    id: MESSAGE,
    author: { id: BOT },
    guildId: GUILD,
    channelId: CHANNEL,
    edit: vi.fn(async () => {}),
  };
  const replacement = { ...original, id: "523456789012345678" };
  const destination = {
    id: CHANNEL,
    guildId: GUILD,
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    messages: { fetch: vi.fn(async () => original) },
    send: vi.fn(async () => replacement),
  };
  const guild = {
    id: GUILD,
    name: "Server",
    channels: { fetch: vi.fn(async () => destination) },
    members: {
      fetchMe: vi.fn(async () => ({ permissions: { has: () => true } })),
    },
  };
  const client = {
    user: { id: BOT },
    guilds: {
      cache: new Map([[GUILD, guild]]),
      fetch: vi.fn(async () => guild),
    },
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
    isReady: () => true,
  } as unknown as Client;
  const controls = testControls();
  controls.ownerId = "999999999999999999";
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as Logger;
  const panel = createPermanentPanel(
    client,
    store,
    logger,
    new Sessions(),
    controls,
    async () => ({ embeds: [], components: [] }),
  );
  disposals.push(async () => {
    await panel.dispose();
    store.close();
  });
  return { store, panel, destination, original, replacement, guild, logger };
}
describe("coordinated panel restart restoration", () => {
  it("shares one startup promise and edits the same message once on concurrent ready events", async () => {
    const f = fixture();
    const a = f.panel.start(),
      b = f.panel.start();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    await f.panel.start();
    expect(f.original.edit).toHaveBeenCalledTimes(1);
    expect(f.destination.send).not.toHaveBeenCalled();
    expect(f.panel.get(GUILD)?.panelMessageId).toBe(MESSAGE);
  });
  it("keeps manual recovery as the default for deleted messages", async () => {
    const f = fixture();
    f.destination.messages.fetch.mockRejectedValue({ code: 10008 });
    await f.panel.start();
    expect(f.destination.send).not.toHaveBeenCalled();
    expect(f.panel.get(GUILD)?.status).toBe("unavailable");
  });
  it("replaces a definitively deleted message once only when explicitly configured", async () => {
    const f = fixture("replace");
    f.destination.messages.fetch.mockRejectedValue({ code: 10008 });
    await Promise.all([f.panel.start(), f.panel.start()]);
    expect(f.destination.send).toHaveBeenCalledTimes(1);
    expect(f.panel.get(GUILD)?.panelMessageId).toBe(f.replacement.id);
    expect(f.panel.get(GUILD)?.recoveryBehavior).toBe("replace");
    expect(f.store.get(GUILD, "panel_creation", "main")).toBeUndefined();
  });
  it.each([50013, 50001, 10003, "ETIMEDOUT"])(
    "never replaces a message on non-deletion failure %s",
    async (code) => {
      const f = fixture("replace");
      f.destination.messages.fetch.mockRejectedValue({ code });
      await f.panel.start();
      expect(f.destination.send).not.toHaveBeenCalled();
      expect(f.panel.get(GUILD)?.panelMessageId).toBe(MESSAGE);
    },
  );
  it("refuses wrong-author references even with automatic replacement configured", async () => {
    const f = fixture("replace");
    f.original.author.id = "623456789012345678";
    await f.panel.start();
    expect(f.destination.send).not.toHaveBeenCalled();
    expect(f.original.edit).not.toHaveBeenCalled();
  });
  it("leaves uncertain creation journal durable and does not retry after ready repeats", async () => {
    const f = fixture("replace");
    f.destination.messages.fetch.mockRejectedValue({ code: 10008 });
    f.destination.send.mockRejectedValue(new Error("network uncertain"));
    await f.panel.start();
    await f.panel.start();
    expect(f.destination.send).toHaveBeenCalledTimes(1);
    expect(f.store.get(GUILD, "panel_creation", "main")).toMatchObject({
      state: "pending",
    });
    expect(f.panel.get(GUILD)?.status).toBe("unavailable");
  });
});
