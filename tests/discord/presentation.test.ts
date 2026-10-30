import { describe, it, expect, vi } from "vitest";
import { createEmbed, EMBED_COLORS } from "../../src/discord/embeds.js";
import {
  incidentText,
  operationText,
  previewText,
  restorationTone,
} from "../../src/discord/presentation.js";
import { userErrorText, UserError } from "../../src/discord/errors.js";
import { createAdapter } from "../../src/discord/adapter.js";
import { SqliteStore } from "../../src/database/index.js";
import { t } from "../../src/locales/index.js";
import type { Incident } from "../../src/contracts.js";
import type { Client } from "discord.js";
import type { Logger } from "pino";
const incident: Incident = {
  id: "event",
  guildId: "guild",
  event: {
    id: "event",
    guildId: "guild",
    action: "channel.delete",
    executorId: "actor",
    targetId: "target",
    source: "gateway",
    timestamp: 1,
    severity: "critical",
  },
  createdAt: 1,
  confidence: "unresolved",
  policy: "ban",
  status: "recorded",
  result: "Unresolved attribution: no enforcement",
};
describe("localized embeds and saved result presentation", () => {
  it.each([
    ["tr", "Casi tarafından geliştirildi"],
    ["en", "Developed by Casi"],
  ] as const)(
    "brands %s embeds and preserves footer signature under limits",
    (language, signature) => {
      const embed = createEmbed(language, {
        title: "x".repeat(300),
        description: "y".repeat(9000),
        footer: "z".repeat(4000),
        tone: "success",
      }).toJSON();
      expect(embed.footer?.text.endsWith(signature)).toBe(true);
      expect(embed.color).toBe(EMBED_COLORS.success);
      expect(embed.title!.length).toBeLessThanOrEqual(256);
      expect(embed.description!.length).toBeLessThanOrEqual(4096);
      expect(embed.footer!.text.length).toBeLessThanOrEqual(2048);
      expect(
        embed.title!.length +
          embed.description!.length +
          embed.footer!.text.length,
      ).toBeLessThanOrEqual(6000);
    },
  );
  it("translates legacy saved results without changing security records", () => {
    expect(operationText("tr", "Executor kicked.")).toContain("atıldı");
    expect(operationText("en", "Below threshold (2/5)")).toContain("2 of 5");
    expect(incidentText("tr", incident)).toContain("Doğrulanamadı");
    expect(incident.result).toBe("Unresolved attribution: no enforcement");
  });
  it("does not expose technical errors or stack traces", () => {
    const secret = "PRIVATE_API_ERROR sentry://trace";
    expect(userErrorText("tr", new Error(secret))).not.toContain(secret);
    expect(operationText("en", secret)).not.toContain(secret);
    expect(userErrorText("tr", new UserError("whitelist.invalidId"))).toContain(
      "ID",
    );
  });
  it("shows severity, target and time while hiding an unconfirmed executor", () => {
    const unresolved = incidentText("en", incident);
    expect(unresolved).toContain("Severity: Critical");
    expect(unresolved).toContain("Target: target");
    expect(unresolved).toContain("Time: <t:0:f>");
    expect(unresolved).not.toContain("<@actor>");
    expect(
      incidentText("en", { ...incident, confidence: "confirmed" }),
    ).toContain("<@actor>");
  });
  it("requires a supported preview before displaying confirmation information", () => {
    expect(() => previewText("tr", "Unexpected backend output")).toThrow();
    const source =
      "Scope: all. Roles: 3; channels: 2. Missing roles: 1; missing channels: 0. Skipped channel types: 4.";
    expect(previewText("tr", source)).toContain("Roller: 3");
    expect(previewText("tr", source)).toContain("YENİ");
    expect(previewText("en", source)).toContain("NEW IDs");
  });
  it("localizes incident notifications using each guild setting and retains uncertainty", async () => {
    const store = new SqliteStore(":memory:");
    try {
      const config = store.getConfig("guild");
      config.language = "tr";
      config.logChannelId = "123456789012345678";
      store.setConfig("guild", config);
      const message = {
        id: "223456789012345678",
        author: { id: "bot" },
        channelId: config.logChannelId,
        guildId: "guild",
        edit: vi.fn(async (_payload: unknown) => {}),
      };
      const send = vi.fn(async (_payload: unknown) => message);
      const client = {
        user: { id: "bot" },
        guilds: {
          fetch: vi.fn(async () => ({
            channels: {
              fetch: vi.fn(async () => ({
                isTextBased: () => true,
                send,
                messages: { fetch: vi.fn(async () => message) },
              })),
            },
          })),
        },
      } as unknown as Client;
      const adapter = createAdapter(client, store, {
        info: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger);
      await adapter.log(incident);
      const embed = send.mock.calls[0]![0] as {
        embeds: ReturnType<typeof createEmbed>[];
      };
      const payload = embed.embeds[0]!.toJSON();
      expect(payload.footer?.text).toBe("Casi tarafından geliştirildi");
      expect(payload.title).toBe(t("tr", "activity.title.unresolved"));
      expect(JSON.stringify(payload)).not.toContain("actor");
      config.language = "en";
      store.setConfig("guild", config);
      await adapter.log(incident);
      const second = message.edit.mock.calls[0]![0] as {
        embeds: ReturnType<typeof createEmbed>[];
      };
      expect(second.embeds[0]!.toJSON().footer?.text).toBe("Developed by Casi");
      expect(send).toHaveBeenCalledOnce();
    } finally {
      store.close();
    }
  });
});

it("reserves green restoration success for explicitly completed resources", () => {
  expect(
    restorationTone(
      "Recovery job: abcd-1234\nRole 123: restored\nGuild settings: restored",
    ),
  ).toBe("success");
  expect(
    restorationTone(
      "Recovery job: abcd-1234\nRole 123: restored\nChannel 456: Missing Manage Channels permission.",
    ),
  ).toBe("warning");
  expect(
    restorationTone("Recovery job: abcd-1234\nRole 123: managed, skipped"),
  ).toBe("warning");
  expect(restorationTone("unexpected backend output")).toBe("warning");
});
