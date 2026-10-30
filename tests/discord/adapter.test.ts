import { describe, expect, it, vi } from "vitest";
import { PermissionFlagsBits, type Client } from "discord.js";
import type { Logger } from "pino";
import type { SecurityEvent, Store } from "../../src/contracts.js";
import { createAdapter } from "../../src/discord/adapter.js";
const event: SecurityEvent = {
  id: "1",
  guildId: "guild",
  action: "channel.delete",
  targetId: "channel",
  executorId: "actor",
  timestamp: Date.now(),
  source: "audit",
  auditAction: 12,
};
function setup(overrides: Record<string, unknown> = {}) {
  const member = {
    roles: { highest: {} },
    kickable: true,
    bannable: true,
    kick: vi.fn(),
    ban: vi.fn(),
    ...overrides,
  };
  const me = {
    roles: { highest: { comparePositionTo: () => 1 } },
    permissions: { has: () => true },
  };
  const guild = {
    ownerId: "owner",
    roles: { fetch: vi.fn() },
    members: {
      fetch: vi.fn(async () => member),
      fetchMe: vi.fn(async () => me),
    },
  };
  const client = {
    user: { id: "self" },
    guilds: { fetch: vi.fn(async () => guild) },
  } as unknown as Client;
  return {
    adapter: createAdapter(
      client,
      {} as Store,
      { warn: vi.fn() } as unknown as Logger,
    ),
    member,
    me,
    guild,
  };
}
describe("enforcement boundary", () => {
  it("refuses owner and self", async () => {
    const { adapter } = setup();
    await expect(
      adapter.enforce({ ...event, executorId: "owner" }, "ban"),
    ).rejects.toThrow("Protected");
    await expect(
      adapter.enforce({ ...event, executorId: "self" }, "kick"),
    ).rejects.toThrow("Protected");
  });
  it("refuses hierarchy mismatch", async () => {
    const { adapter, me, member } = setup();
    me.roles.highest.comparePositionTo = () => 0;
    await expect(adapter.enforce(event, "ban")).rejects.toThrow("hierarchy");
    expect(member.ban).not.toHaveBeenCalled();
  });
  it("refuses missing permission", async () => {
    const { adapter, me, member } = setup();
    me.permissions.has = () => false;
    await expect(adapter.enforce(event, "kick")).rejects.toThrow("permission");
    expect(member.kick).not.toHaveBeenCalled();
  });
  it("propagates API failure for persisted incident result", async () => {
    const { adapter, member } = setup();
    member.ban.mockRejectedValue(new Error("API denied"));
    await expect(adapter.enforce(event, "ban")).rejects.toThrow("API denied");
  });
  it("does not erase messages on ban", async () => {
    const { adapter, member } = setup();
    await adapter.enforce(event, "ban");
    expect(member.ban).toHaveBeenCalledWith(
      expect.objectContaining({ deleteMessageSeconds: 0 }),
    );
  });
  it("fails closed when whitelist roles cannot be fetched", async () => {
    const { adapter, guild } = setup();
    guild.members.fetch.mockRejectedValue(new Error("Unavailable"));
    await expect(adapter.context(event)).rejects.toThrow("Unavailable");
  });
  it("uses documented danger permissions", () =>
    expect(PermissionFlagsBits.Administrator).toBe(8n));
});
