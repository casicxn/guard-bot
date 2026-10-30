import { testControls } from "../helpers/controls.js";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { Events, type Client } from "discord.js";
import type { Logger } from "pino";
import type { BackupService, Store } from "../../src/contracts.js";
import { installDiscord } from "../../src/discord/index.js";
function setup() {
  const bus = new EventEmitter();
  const processor = { process: vi.fn(async () => undefined) };
  const dispose = installDiscord(
    bus as unknown as Client,
    {} as Store,
    processor,
    {} as BackupService,
    { error: vi.fn(), warn: vi.fn() } as unknown as Logger,
    testControls(),
  );
  return { bus, processor, dispose };
}
describe("gateway normalization", () => {
  it("rejects duplicate listener installation and allows reinstall after disposal", async () => {
    const { bus, processor, dispose } = setup();
    const install = () =>
      installDiscord(
        bus as unknown as Client,
        {} as Store,
        processor,
        {} as BackupService,
        { error: vi.fn(), warn: vi.fn() } as unknown as Logger,
        testControls(),
      );
    expect(install).toThrow("already installed");
    expect(bus.listenerCount(Events.GuildAuditLogEntryCreate)).toBe(1);
    await dispose();
    await install()();
    expect(bus.listenerCount(Events.GuildAuditLogEntryCreate)).toBe(0);
  });
  it("routes authoritative channel deletion with exact audit target", async () => {
    const { bus, processor } = setup();
    bus.emit(
      Events.GuildAuditLogEntryCreate,
      {
        id: "audit",
        action: 12,
        targetId: "channel",
        executorId: "actor",
        createdTimestamp: Date.now(),
        changes: [],
      },
      { id: "guild" },
    );
    await Promise.resolve();
    expect(processor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "audit",
        action: "channel.delete",
        targetId: "channel",
        executorId: "actor",
        auditAction: 12,
        source: "audit",
      }),
    );
  });
  it("escalates dangerous newly granted permission", async () => {
    const { bus, processor } = setup();
    bus.emit(
      Events.GuildAuditLogEntryCreate,
      {
        id: "audit",
        action: 31,
        targetId: "role",
        executorId: "actor",
        createdTimestamp: Date.now(),
        changes: [{ key: "permissions", old: "0", new: "8" }],
      },
      { id: "guild" },
    );
    await Promise.resolve();
    expect(processor.process).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.permissions" }),
    );
  });
  it("escalates dangerous initial role creation permissions", async () => {
    const { bus, processor } = setup();
    bus.emit(
      Events.GuildAuditLogEntryCreate,
      {
        id: "audit",
        action: 30,
        targetId: "role",
        executorId: "actor",
        createdTimestamp: Date.now(),
        changes: [{ key: "permissions", new: "8" }],
      },
      { id: "guild" },
    );
    await Promise.resolve();
    expect(processor.process).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.permissions", source: "audit" }),
    );
  });
  it("escalates a dangerous audited member role assignment", async () => {
    const { bus, processor, dispose } = setup();
    const fetch = vi.fn(async () => ({ permissions: { bitfield: 8n } }));
    bus.emit(
      Events.GuildAuditLogEntryCreate,
      {
        id: "audit",
        action: 25,
        targetId: "member",
        executorId: "actor",
        createdTimestamp: Date.now(),
        changes: [{ key: "$add", new: [{ id: "admin-role" }] }],
      },
      { id: "guild", roles: { fetch } },
    );
    await dispose();
    expect(fetch).toHaveBeenCalledWith("admin-role", { force: true });
    expect(processor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "member.permissions",
        source: "audit",
      }),
    );
  });
  it("records uncertain role grants without punitive attribution when lookup fails", async () => {
    const { bus, processor, dispose } = setup();
    bus.emit(
      Events.GuildAuditLogEntryCreate,
      {
        id: "audit",
        action: 25,
        targetId: "member",
        executorId: "actor",
        createdTimestamp: Date.now(),
        changes: [{ key: "$add", new: [{ id: "missing" }] }],
      },
      { id: "guild", roles: { fetch: vi.fn(async () => null) } },
    );
    await dispose();
    expect(processor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "member.permissions",
        source: "gateway",
      }),
    );
  });
  it("clears delayed fallbacks and removes handlers during shutdown", async () => {
    vi.useFakeTimers();
    try {
      const { bus, processor, dispose } = setup();
      bus.emit(Events.ChannelDelete, { id: "channel", guild: { id: "guild" } });
      await dispose();
      await vi.advanceTimersByTimeAsync(5000);
      expect(processor.process).not.toHaveBeenCalled();
      expect(bus.listenerCount(Events.GuildAuditLogEntryCreate)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("waits for in-flight processors during shutdown", async () => {
    const { bus, processor, dispose } = setup();
    let done!: () => void;
    processor.process.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = () => resolve(undefined);
        }),
    );
    bus.emit(
      Events.GuildAuditLogEntryCreate,
      {
        id: "audit",
        action: 12,
        targetId: "channel",
        executorId: "actor",
        createdTimestamp: Date.now(),
        changes: [],
      },
      { id: "guild" },
    );
    let stopped = false;
    const stop = dispose().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    done();
    await stop;
    expect(stopped).toBe(true);
  });
  it("never attributes departures to kicks", () => {
    const { bus, processor } = setup();
    bus.emit(Events.GuildMemberRemove, {
      id: "member",
      guild: { id: "guild" },
    });
    expect(processor.process).not.toHaveBeenCalled();
  });
  it("records unresolved deletion when audit never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { bus, processor } = setup();
      bus.emit(Events.ChannelDelete, { id: "channel", guild: { id: "guild" } });
      await vi.advanceTimersByTimeAsync(3000);
      expect(processor.process).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "gateway",
          executorId: null,
          action: "channel.delete",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("suppresses fallback when delayed matching audit arrives", async () => {
    vi.useFakeTimers();
    try {
      const { bus, processor } = setup();
      bus.emit(Events.GuildRoleDelete, { id: "role", guild: { id: "guild" } });
      await vi.advanceTimersByTimeAsync(1000);
      bus.emit(
        Events.GuildAuditLogEntryCreate,
        {
          id: "audit",
          action: 32,
          targetId: "role",
          executorId: "actor",
          createdTimestamp: Date.now(),
          changes: [],
        },
        { id: "guild" },
      );
      await vi.advanceTimersByTimeAsync(3000);
      expect(processor.process).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
