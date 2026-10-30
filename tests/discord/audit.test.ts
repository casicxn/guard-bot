import { describe, it, expect, vi } from "vitest";
import {
  Collection,
  AuditLogEvent,
  type Guild,
  type GuildAuditLogs,
  type GuildAuditLogsEntry,
} from "discord.js";
import { AuditFallback, normalizeAudit } from "../../src/discord/audit.js";
import type { SecurityEvent } from "../../src/contracts.js";
const event = (): SecurityEvent => ({
  id: "gateway",
  guildId: "guild",
  action: "channel.delete",
  targetId: "channel",
  executorId: null,
  timestamp: Date.now(),
  source: "gateway",
});
describe("overwrite audit principal identity", () => {
  it.each([
    ["0", 0],
    ["1", 1],
  ] as const)(
    "preserves validated overwrite type %s",
    async (type, expected) => {
      const entry = {
        id: "123",
        action: AuditLogEvent.ChannelOverwriteUpdate,
        targetId: "223456789012345678",
        executorId: "323456789012345678",
        createdTimestamp: Date.now(),
        changes: [],
        extra: { id: "423456789012345678", type },
      } as unknown as GuildAuditLogsEntry;
      const normalized = await normalizeAudit(entry, {
        id: "123456789012345678",
      } as Guild);
      expect(normalized?.overwrite).toEqual({
        id: "423456789012345678",
        type: expected,
      });
    },
  );
  it("does not guess an overwrite principal from a name or unknown type", async () => {
    const entry = {
      id: "123",
      action: AuditLogEvent.ChannelOverwriteUpdate,
      targetId: "223456789012345678",
      executorId: "323456789012345678",
      createdTimestamp: Date.now(),
      changes: [],
      extra: { id: "Moderator", type: "unknown" },
    } as unknown as GuildAuditLogsEntry;
    expect(
      (await normalizeAudit(entry, { id: "123456789012345678" } as Guild))
        ?.overwrite,
    ).toBeUndefined();
  });
});
function fixture(
  entries: {
    id: string;
    targetId?: string;
    executorId?: string;
    action?: AuditLogEvent;
  }[],
) {
  const logs = {
    entries: new Collection(
      entries.map((e) => [
        e.id,
        {
          action: AuditLogEvent.ChannelDelete,
          targetId: "channel",
          executorId: "actor",
          createdTimestamp: Date.now(),
          changes: [],
          ...e,
        },
      ]),
    ),
  } as unknown as GuildAuditLogs;
  const fetch = vi.fn(async () => logs);
  const guild = {
    id: "guild",
    members: { me: { permissions: { has: () => true } } },
    fetchAuditLogs: fetch,
  } as unknown as Guild;
  return { fetch, guild, logs };
}
describe("bounded live audit fallback", () => {
  it("resolves exact action/target and shares concurrent API requests", async () => {
    const f = fixture([{ id: "a" }]);
    const fallback = new AuditFallback();
    const results = await Promise.all([
      fallback.resolve(f.guild, event()),
      fallback.resolve(f.guild, event()),
    ]);
    expect(results[0]).toMatchObject({
      id: "a",
      source: "audit",
      executorId: "actor",
    });
    expect(results[1]?.id).toBe("a");
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses competing executors on the same target", async () => {
    const f = fixture([{ id: "a" }, { id: "b", executorId: "other" }]);
    expect(await new AuditFallback().resolve(f.guild, event())).toBeUndefined();
  });
  it("retries a delayed entry and rejects a wrong target", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture([{ id: "a" }]);
      f.fetch.mockResolvedValueOnce({
        entries: new Collection(),
      } as GuildAuditLogs);
      const task = new AuditFallback().resolve(f.guild, event());
      await vi.advanceTimersByTimeAsync(501);
      expect((await task)?.id).toBe("a");
      expect(f.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("degrades after two API failures without attribution", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture([]);
      f.fetch.mockRejectedValue(
        new Error("Missing permissions / rate limited"),
      );
      const task = new AuditFallback().resolve(f.guild, event());
      await vi.advanceTimersByTimeAsync(501);
      expect(await task).toBeUndefined();
      expect(f.fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not query when audit permission is absent", async () => {
    const f = fixture([{ id: "a" }]);
    vi.spyOn(f.guild.members.me!.permissions, "has").mockReturnValue(false);
    expect(await new AuditFallback().resolve(f.guild, event())).toBeUndefined();
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("does not guess a match by proximity when target differs", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture([{ id: "a", targetId: "wrong" }]);
      const task = new AuditFallback().resolve(f.guild, event());
      await vi.advanceTimersByTimeAsync(501);
      expect(await task).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
