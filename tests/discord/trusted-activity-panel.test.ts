import { describe, it, expect, vi } from "vitest";
import {
  ChannelType,
  GatewayIntentBits,
  IntentsBitField,
  type Client,
  type Guild,
} from "discord.js";
import type { Logger } from "pino";
import type { BackupService, Incident } from "../../src/contracts.js";
import { SqliteStore } from "../../src/database/index.js";
import { Sessions } from "../../src/discord/sessions.js";
import { createPanels } from "../../src/discord/panels.js";
import { createPermanentPanel } from "../../src/discord/permanent-panel.js";
import { testControls } from "../helpers/controls.js";
const GUILD = "123456789012345678",
  CHANNEL = "223456789012345678",
  OWNER = "999999999999999999",
  BOT = "323456789012345678";
function incident(id: string, safe: boolean): Incident {
  return {
    id,
    guildId: GUILD,
    createdAt: Date.now() - (safe ? 0 : 1000),
    confidence: "confirmed",
    event: {
      id,
      guildId: GUILD,
      action: safe ? "channel.create" : "role.delete",
      auditAction: safe ? 10 : 32,
      targetId: "423456789012345678",
      executorId: "523456789012345678",
      timestamp: Date.now(),
      source: "audit",
      severity: safe ? "warning" : "critical",
    },
    status: safe ? "exempt" : "recorded",
    policy: "log",
    result: safe ? "Action-specific whitelist" : "Monitor only",
    ...(safe ? { exemption: "whitelistUser" as const } : {}),
  };
}
function fixture() {
  const store = new SqliteStore(":memory:"),
    sessions = new Sessions(),
    controls = testControls();
  controls.ownerId = OWNER;
  let published: unknown;
  const message = {
    id: "623456789012345678",
    author: { id: BOT },
    channelId: CHANNEL,
    guildId: GUILD,
    edit: vi.fn(async (value: unknown) => {
      published = value;
    }),
    pinned: false,
  };
  const channel = {
    guildId: GUILD,
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    messages: { fetch: async () => message },
    send: vi.fn(async (value: unknown) => {
      published = value;
      return message;
    }),
  };
  const guild = {
    id: GUILD,
    name: "Example",
    members: {
      fetchMe: async () => ({
        permissions: { has: () => true },
        roles: { highest: { name: "Guard" } },
      }),
    },
    channels: { fetch: async () => channel },
  } as unknown as Guild;
  const client = {
    user: { id: BOT },
    guilds: { cache: new Map([[GUILD, guild]]), fetch: async () => guild },
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
    isReady: () => true,
    ws: { ping: 1 },
    uptime: 1,
  } as unknown as Client;
  const backup = { list: () => [] } as unknown as BackupService,
    logger = { warn: vi.fn() } as unknown as Logger;
  const build = createPanels(client, store, backup, sessions, logger, controls),
    manager = createPermanentPanel(
      client,
      store,
      logger,
      sessions,
      controls,
      build,
    );
  const description = (payload: unknown) =>
    (
      JSON.parse(JSON.stringify(payload)) as {
        embeds: { description: string }[];
      }
    ).embeds[0]!.description;
  return {
    store,
    manager,
    build,
    guild,
    description,
    published: () => published,
    close: async () => {
      await manager.dispose();
      store.close();
    },
  };
}
describe("trusted activity is visible without inflating security incidents", () => {
  it("keeps green activity in the public overview while excluding it from hostile counts and last incident", async () => {
    const f = fixture();
    try {
      f.store.put(GUILD, "incidents", "hostile", incident("hostile", false));
      f.store.put(GUILD, "incidents", "safe", incident("safe", true));
      await f.manager.ensure(OWNER, GUILD, CHANNEL);
      const description = f.description(f.published());
      expect(description).toContain("24 saatteki olaylar: **1**");
      expect(description).toContain("🟢 Güvenli");
      expect(description).toContain("🟡 İzleniyor");
      expect(description).toMatch(/Son doğrulanmış olay: Rol Silme/);
      expect(description).not.toContain("523456789012345678");
    } finally {
      await f.close();
    }
  });
  it("removes verified harmless records from incident pages and old overview counters without deleting history", async () => {
    const f = fixture();
    try {
      const safe = incident("saved-safe", true);
      delete safe.exemption;
      f.store.put(GUILD, "incidents", safe.id, safe);
      f.store.put(GUILD, "incidents", "hostile", incident("hostile", false));
      const page = await f.build(f.guild, OWNER, "incidents");
      expect(f.description(page)).toContain("hostile");
      expect(f.description(page)).not.toContain("saved-safe");
      const overview = await f.build(f.guild, OWNER);
      expect(f.description(overview)).toContain("24 saatteki olaylar: **1**");
      expect(f.store.get(GUILD, "incidents", safe.id)).toEqual(safe);
    } finally {
      await f.close();
    }
  });
  it("never turns an unknown executor into safe activity merely because an exemption field exists", async () => {
    const f = fixture();
    try {
      const unknown = incident("unknown", true);
      unknown.confidence = "unresolved";
      unknown.event.executorId = null;
      f.store.put(GUILD, "incidents", unknown.id, unknown);
      await f.manager.ensure(OWNER, GUILD, CHANNEL);
      const description = f.description(f.published());
      expect(description).toContain("24 saatteki olaylar: **1**");
      expect(description).toContain("🟠 Belirsiz");
      expect(description).not.toContain("🟢 Güvenli");
    } finally {
      await f.close();
    }
  });
});
