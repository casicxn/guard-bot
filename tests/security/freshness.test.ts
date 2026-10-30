import { testControls } from "../helpers/controls.js";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { AuditLogEvent, Events, type Client } from "discord.js";
import type { Logger } from "pino";
import type {
  BackupService,
  SecurityEvent,
  Store,
} from "../../src/contracts.js";
import { reverseAuditEvent } from "../../src/recovery/reverse.js";
import { installDiscord } from "../../src/discord/index.js";

const event: SecurityEvent = {
  id: "123",
  guildId: "100",
  targetId: "200",
  executorId: "2",
  source: "audit",
  timestamp: Date.now(),
  action: "role.permissions",
  auditAction: AuditLogEvent.RoleUpdate,
  changes: { permissions: { old: "0", new: "8" } },
};

describe("security freshness regressions", () => {
  it("refuses reversal when a forced role read reveals a newer change", async () => {
    const edit = vi.fn(async () => {});
    const cached = {
      id: "200",
      managed: false,
      editable: true,
      permissions: { bitfield: 8n },
      edit,
    };
    const current = { ...cached, permissions: { bitfield: 16n } };
    const guild = {
      id: "100",
      ownerId: "1",
      members: {
        fetchMe: vi.fn(async () => ({ permissions: { has: () => true } })),
      },
      roles: {
        fetch: vi.fn(async (_id: string, options?: { force?: boolean }) =>
          options?.force ? current : cached,
        ),
      },
    };
    const client = {
      user: { id: "9" },
      guilds: { fetch: vi.fn(async () => guild) },
    } as unknown as Client;
    const store = {
      claim: vi.fn(() => true),
      put: vi.fn(),
    } as unknown as Store;
    await expect(
      reverseAuditEvent(client, { ...event, timestamp: Date.now() }, store),
    ).rejects.toThrow("changed since");
    expect(edit).not.toHaveBeenCalled();
  });
  it("routes creating a role with Administrator through the critical permissions policy", async () => {
    const bus = new EventEmitter();
    const processor = { process: vi.fn(async () => undefined) };
    installDiscord(
      bus as unknown as Client,
      {} as Store,
      processor,
      {} as BackupService,
      { error: vi.fn(), warn: vi.fn() } as unknown as Logger,
      testControls(),
    );
    bus.emit(
      Events.GuildAuditLogEntryCreate,
      {
        id: "audit",
        action: AuditLogEvent.RoleCreate,
        targetId: "role",
        executorId: "actor",
        createdTimestamp: Date.now(),
        changes: [{ key: "permissions", new: "8" }],
      },
      { id: "guild" },
    );
    await Promise.resolve();
    expect(processor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "role.permissions",
        auditAction: AuditLogEvent.RoleCreate,
      }),
    );
  });
});
