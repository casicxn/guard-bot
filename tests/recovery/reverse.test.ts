import { describe, expect, it, vi } from "vitest";
import { AuditLogEvent, type Client } from "discord.js";
import { reverseAuditEvent } from "../../src/recovery/reverse.js";
import type { SecurityEvent, Store } from "../../src/contracts.js";
function fixture() {
  const role = {
    id: "200",
    managed: false,
    editable: true,
    name: "New",
    permissions: { bitfield: 8n },
    edit: vi.fn(async () => {}),
  };
  const guild = {
    id: "100",
    ownerId: "1",
    name: "Changed",
    verificationLevel: 2,
    explicitContentFilter: 1,
    defaultMessageNotifications: 1,
    members: {
      fetchMe: vi.fn(async () => ({ permissions: { has: () => true } })),
    },
    roles: { fetch: vi.fn(async () => role) },
    edit: vi.fn(async () => {}),
  };
  const client = {
    user: { id: "9" },
    guilds: { fetch: vi.fn(async () => guild) },
  } as unknown as Client;
  const store = { claim: vi.fn(() => true), put: vi.fn() } as unknown as Store;
  const event: SecurityEvent = {
    id: "123",
    guildId: "100",
    targetId: "200",
    executorId: "2",
    source: "audit",
    timestamp: Date.now(),
    action: "role.update",
    auditAction: AuditLogEvent.RoleUpdate,
    changes: { permissions: { old: "0", new: "8" } },
  };
  return { role, guild, client, store, event };
}
describe("safe automatic reverse", () => {
  it("reverts validated role permissions and journals first", async () => {
    const f = fixture();
    await reverseAuditEvent(f.client, f.event, f.store);
    expect(f.role.edit).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: 0n }),
    );
    expect(vi.mocked(f.store.put).mock.invocationCallOrder[0]).toBeLessThan(
      f.role.edit.mock.invocationCallOrder[0]!,
    );
  });
  it("refuses stale live state", async () => {
    const f = fixture();
    f.role.permissions.bitfield = 16n;
    await expect(reverseAuditEvent(f.client, f.event, f.store)).rejects.toThrow(
      "changed since",
    );
    expect(f.role.edit).not.toHaveBeenCalled();
  });
  it("refuses invalid prior permissions", async () => {
    const f = fixture();
    f.event.changes = { permissions: { old: "bad", new: "8" } };
    await expect(
      reverseAuditEvent(f.client, f.event, f.store),
    ).rejects.toThrow();
    expect(f.role.edit).not.toHaveBeenCalled();
  });
  it("refuses unsupported fields instead of partial blind edits", async () => {
    const f = fixture();
    f.event.changes = {
      permissions: { old: "0", new: "8" },
      icon: { old: "old", new: "new" },
    };
    await expect(reverseAuditEvent(f.client, f.event, f.store)).rejects.toThrow(
      "cannot safely",
    );
    expect(f.role.edit).not.toHaveBeenCalled();
  });
  it("refuses owner events", async () => {
    const f = fixture();
    f.event.executorId = "1";
    await expect(reverseAuditEvent(f.client, f.event, f.store)).rejects.toThrow(
      "Protected",
    );
  });
  it("refuses a repeated persisted decision", async () => {
    const f = fixture();
    vi.mocked(f.store.claim).mockReturnValue(false);
    expect(await reverseAuditEvent(f.client, f.event, f.store)).toContain(
      "already attempted",
    );
    expect(f.role.edit).not.toHaveBeenCalled();
  });
  it("reverses guild name only after exact match", async () => {
    const f = fixture();
    f.event.auditAction = AuditLogEvent.GuildUpdate;
    f.event.targetId = "100";
    f.event.changes = { name: { old: "Original", new: "Changed" } };
    await reverseAuditEvent(f.client, f.event, f.store);
    expect(f.guild.edit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Original" }),
    );
  });
  it("refuses old audit events", async () => {
    const f = fixture();
    f.event.timestamp -= 60_000;
    await expect(reverseAuditEvent(f.client, f.event, f.store)).rejects.toThrow(
      "recent",
    );
  });
});
