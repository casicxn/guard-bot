import { describe, it, expect, vi } from "vitest";
import type { Client } from "discord.js";
import type { Logger } from "pino";
import type { Incident } from "../../src/contracts.js";
import { SqliteStore } from "../../src/database/index.js";
import {
  buildSecurityLog,
  createSecurityLogDelivery,
} from "../../src/discord/security-log.js";
import { ACTIVITY_COLORS } from "../../src/security/activity.js";
const GUILD = "123456789012345678",
  CHANNEL = "223456789012345678",
  BOT = "323456789012345678";
const sample = (): Incident => ({
  id: "audit",
  guildId: GUILD,
  createdAt: Date.now(),
  confidence: "confirmed",
  policy: "strip",
  status: "exempt",
  result: "Action-specific whitelist",
  exemption: "whitelistUser",
  event: {
    id: "audit",
    guildId: GUILD,
    action: "channel.create",
    auditAction: 10,
    targetId: "423456789012345678",
    executorId: "523456789012345678",
    source: "audit",
    timestamp: Date.now(),
  },
});
function fixture() {
  const store = new SqliteStore(":memory:"),
    config = store.getConfig(GUILD);
  config.logChannelId = CHANNEL;
  store.setConfig(GUILD, config);
  const message = {
      id: "623456789012345678",
      author: { id: BOT },
      channelId: CHANNEL,
      guildId: GUILD,
      edit: vi.fn(async (_payload: unknown) => {}),
    },
    send = vi.fn(async (_payload: unknown) => message),
    fetchMessage = vi.fn(async () => message),
    channel = {
      isTextBased: () => true,
      send,
      messages: { fetch: fetchMessage },
    },
    client = {
      user: { id: BOT },
      guilds: {
        fetch: vi.fn(async () => ({
          channels: { fetch: vi.fn(async () => channel) },
        })),
      },
    } as unknown as Client,
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
  return {
    store,
    message,
    send,
    fetchMessage,
    logger,
    deliver: createSecurityLogDelivery(client, store, logger),
    client,
  };
}
describe("localized reusable security activity embeds", () => {
  it.each(["tr", "en"] as const)(
    "shows verified safe action green with no enforcement in %s",
    (language) => {
      const embed = buildSecurityLog(language, sample()).toJSON();
      expect(embed.color).toBe(0x57f287);
      expect(embed.title).toContain(language === "tr" ? "Güvenli" : "Safe");
      expect(embed.footer?.text).toContain(
        language === "tr" ? "Casi tarafından" : "Developed by Casi",
      );
      expect(JSON.stringify(embed)).not.toContain("activity.");
      expect(
        embed.fields?.some(
          (field) => field.value === `<@${sample().event.executorId}>`,
        ),
      ).toBe(true);
      expect(
        embed.fields?.some(
          (field) => field.value === `<#${sample().event.targetId}>`,
        ),
      ).toBe(true);
    },
  );
  it("never displays a claimed unverified executor or safe classification", () => {
    const record = { ...sample(), confidence: "unresolved" as const };
    const embed = buildSecurityLog("tr", record).toJSON();
    expect(embed.color).toBe(ACTIVITY_COLORS.unresolved);
    expect(JSON.stringify(embed)).not.toContain(record.event.executorId!);
  });
  it("uses failure color for a confirmed unsuccessful intervention", () => {
    const record = {
      ...sample(),
      exemption: undefined,
      status: "failed",
      result: "Missing permission",
    };
    expect(buildSecurityLog("en", record).toJSON().color).toBe(0x992d22);
  });
  it("labels a dangerous role creation as creation rather than ordinary role edit", () => {
    const record = sample();
    record.event.action = "role.permissions";
    record.event.auditAction = 30;
    const embed = buildSecurityLog("en", record).toJSON();
    expect(JSON.stringify(embed)).toMatch(/Role created/i);
  });
});
describe("one Discord log per audit event", () => {
  it("coalesces duplicate calls and edits pending/final outcomes instead of sending duplicate messages", async () => {
    const f = fixture();
    try {
      const pending = {
        ...sample(),
        exemption: undefined,
        status: "pending",
        result: "Zero-tolerance decision persisted; containment pending",
      };
      await Promise.all([f.deliver(pending), f.deliver(pending)]);
      expect(f.send).toHaveBeenCalledOnce();
      const final = {
        ...pending,
        status: "handled",
        result: "Executor kicked.",
        policy: "kick",
      };
      await f.deliver(final);
      expect(f.send).toHaveBeenCalledOnce();
      expect(f.message.edit).toHaveBeenCalledOnce();
      expect(f.store.get(GUILD, "security_logs", "audit")).toMatchObject({
        state: "sent",
        messageId: f.message.id,
      });
    } finally {
      f.store.close();
    }
  });
  it("preserves input snapshots while queued decisions change", async () => {
    const f = fixture();
    try {
      const incident = sample();
      const task = f.deliver(incident);
      incident.exemption = undefined;
      incident.status = "failed";
      await task;
      const payload = JSON.parse(JSON.stringify(f.send.mock.calls[0]?.[0])) as {
        embeds: { color: number }[];
      };
      expect(payload.embeds[0]?.color).toBe(0x57f287);
    } finally {
      f.store.close();
    }
  });
  it("updates an existing mapped message after service restart and a guild language change", async () => {
    const f = fixture();
    try {
      await f.deliver(sample());
      const config = f.store.getConfig(GUILD);
      config.language = "en";
      f.store.setConfig(GUILD, config);
      await createSecurityLogDelivery(f.client, f.store, f.logger)(sample());
      expect(f.send).toHaveBeenCalledOnce();
      expect(f.message.edit).toHaveBeenCalledOnce();
      expect(JSON.stringify(f.message.edit.mock.calls)).toContain(
        "Developed by Casi",
      );
    } finally {
      f.store.close();
    }
  });
  it("does not edit another author or replace a missing existing log with a duplicate", async () => {
    const f = fixture();
    try {
      await f.deliver(sample());
      f.message.author.id = "other";
      const config = f.store.getConfig(GUILD);
      config.language = "en";
      f.store.setConfig(GUILD, config);
      await f.deliver(sample());
      expect(f.send).toHaveBeenCalledOnce();
      expect(f.message.edit).not.toHaveBeenCalled();
      expect(f.logger.warn).toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("keeps an uncertain send pending and never blindly repeats it", async () => {
    const f = fixture();
    try {
      f.send.mockRejectedValueOnce(new Error("Connection closed after send"));
      await f.deliver(sample());
      await f.deliver(sample());
      expect(f.send).toHaveBeenCalledOnce();
      expect(f.store.get(GUILD, "security_logs", "audit")).toMatchObject({
        state: "pending",
      });
    } finally {
      f.store.close();
    }
  });
  it("contains API failure without modifying security data or claiming sent", async () => {
    const f = fixture();
    try {
      f.send.mockRejectedValueOnce({ code: 50013 });
      await expect(f.deliver(sample())).resolves.toBeUndefined();
      expect(f.store.get(GUILD, "security_logs", "audit")).toBeUndefined();
      expect(f.logger.warn).toHaveBeenCalled();
      expect(f.store.getConfig(GUILD).mode).toBe("monitor");
    } finally {
      f.store.close();
    }
  });
});
