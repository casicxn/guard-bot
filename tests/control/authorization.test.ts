import { describe, it, expect, vi } from "vitest";
import { MessageFlags, type Interaction } from "discord.js";
import type { Logger } from "pino";
import type { Store, GuildConfig } from "../../src/contracts.js";
import {
  AuthorizationService,
  ownerIdSchema,
} from "../../src/control/authorization.js";
import { readEnvironment } from "../../src/configuration/index.js";
const OWNER = "999999999999999999";
const OTHER = "888888888888888888";
type TestInteraction = Interaction & {
  reply: ReturnType<typeof vi.fn>;
  followUp: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  deferUpdate: ReturnType<typeof vi.fn>;
};
function fixture(language: "tr" | "en" = "tr") {
  const config: GuildConfig = {
    language,
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
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as Store;
  const logger = { warn: vi.fn(), debug: vi.fn() } as unknown as Logger;
  return {
    auth: new AuthorizationService(OWNER, store, logger),
    store,
    logger,
    config,
  };
}
function interaction(
  userId: string = OTHER,
  guildId: string = "111111111111111111",
  overrides: Record<string, unknown> = {},
) {
  return {
    user: { id: userId },
    guildId,
    type: 2,
    guild: { ownerId: userId },
    memberPermissions: { has: () => true },
    reply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    deferUpdate: vi.fn(async () => {}),
    deferred: false,
    replied: false,
    ...overrides,
  } as unknown as TestInteraction;
}
describe("single configured bot ownership", () => {
  it("allows only configured identity in every guild regardless of guild ownership", async () => {
    const { auth } = fixture();
    for (const guild of ["111111111111111111", "222222222222222222"]) {
      const i = interaction(OWNER, guild, { guild: { ownerId: OTHER } });
      expect(auth.isBotOwner(OWNER)).toBe(true);
      expect(await auth.requireBotOwner(i)).toBe(true);
      expect(i.reply).not.toHaveBeenCalled();
    }
    expect(() => auth.assertOwner(OWNER)).not.toThrow();
  });
  it.each([
    "guild owner",
    "administrator",
    "whitelisted user",
    "trusted role holder",
  ])("denies a %s who is not the configured identity", async () => {
    const { auth, store } = fixture();
    const i = interaction();
    expect(auth.isBotOwner(OTHER)).toBe(false);
    expect(await auth.requireBotOwner(i)).toBe(false);
    expect(() => auth.assertOwner(OTHER)).toThrow();
    expect(i.reply).toHaveBeenCalledOnce();
    expect(store.setConfig).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });
  it.each([2, 3, 5])(
    "rejects unauthorized interaction type %s without changing the original panel",
    async (type) => {
      const { auth } = fixture();
      const i = interaction(OTHER, undefined, {
        type,
        customId: "guard:language:forged",
      });
      expect(await auth.requireBotOwner(i)).toBe(false);
      expect(i.editReply).not.toHaveBeenCalled();
      expect(
        (i as unknown as { deferUpdate: unknown }).deferUpdate,
      ).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["tr", "Erişim Engellendi", "Casi tarafından geliştirildi"],
    ["en", "Access Denied", "Developed by Casi"],
  ] as const)(
    "responds with private localized %s denial and no owner identity",
    async (language, title, brand) => {
      const { auth } = fixture(language);
      const i = interaction();
      await auth.requireBotOwner(i);
      const payload = vi.mocked(i.reply).mock.calls[0]![0] as {
        flags: number;
        embeds: {
          toJSON: () => {
            title?: string;
            description?: string;
            footer?: { text: string };
          };
        }[];
      };
      expect(payload.flags).toBe(MessageFlags.Ephemeral);
      const data = payload.embeds[0]!.toJSON();
      expect(data.title).toBe(title);
      expect(data.footer?.text).toBe(brand);
      expect(JSON.stringify(data)).not.toContain(OWNER);
    },
  );
  it("uses a separate ephemeral follow-up for previously acknowledged unauthorized input", async () => {
    const { auth } = fixture();
    const i = interaction(OTHER, undefined, { deferred: true });
    expect(await auth.requireBotOwner(i)).toBe(false);
    expect(i.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.editReply).not.toHaveBeenCalled();
  });
  it("keeps denial final if Discord reports an expired interaction", async () => {
    const { auth, logger } = fixture();
    const i = interaction();
    vi.mocked(i.reply).mockRejectedValue(new Error("Unknown Interaction"));
    expect(await auth.requireBotOwner(i)).toBe(false);
    expect(logger.debug).toHaveBeenCalledOnce();
  });
  it("rate-limits repeated denied-attempt logs while still denying every attempt", async () => {
    vi.useFakeTimers();
    try {
      const { auth, logger } = fixture();
      for (let n = 0; n < 4; n++)
        expect(await auth.requireBotOwner(interaction())).toBe(false);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60001);
      await auth.requireBotOwner(interaction());
      expect(logger.warn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not load ownership from SQLite configuration", () => {
    const f = fixture();
    Object.assign(f.config, { ownerId: OTHER, BOT_OWNER_ID: OTHER });
    expect(f.auth.isBotOwner(OTHER)).toBe(false);
    expect(f.auth.isBotOwner(OWNER)).toBe(true);
  });
});
describe("owner environment validation", () => {
  const valid = {
    DISCORD_TOKEN: "test-token-not-a-real-discord-token",
    DISCORD_CLIENT_ID: "111111111111111111",
    BOT_OWNER_ID: OWNER,
  };
  it("requires a descriptive owner ID at startup", () => {
    const result = () => readEnvironment({ ...valid, BOT_OWNER_ID: undefined });
    expect(result).toThrow(/BOT_OWNER_ID/);
  });
  it.each([
    "",
    "name",
    "<@999999999999999999>",
    "000000000000000000",
    "123",
    "18446744073709551616",
    "1e18",
    "-99999999999999999",
  ])("rejects invalid owner value %s", (owner) => {
    expect(() => readEnvironment({ ...valid, BOT_OWNER_ID: owner })).toThrow();
    expect(() => ownerIdSchema.parse(owner)).toThrow();
  });
  it("accepts valid unsigned Snowflakes and exposes no ownership setting in guild configuration", () => {
    expect(readEnvironment(valid).BOT_OWNER_ID).toBe(OWNER);
    expect(ownerIdSchema.parse("18446744073709551615")).toBe(
      "18446744073709551615",
    );
  });
});
