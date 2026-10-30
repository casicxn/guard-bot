import { describe, expect, it, vi } from "vitest";
import { AuditLogEvent, ChannelType, type Client } from "discord.js";
import type { Logger } from "pino";
import type { SecurityEvent, Store } from "../../src/contracts.js";
import { createRollbackEngine } from "../../src/recovery/rollback.js";
import { acquireRecoveryOperation } from "../../src/recovery/index.js";
import { approveSnapshot } from "../../src/recovery/known-good.js";
import type { Snapshot } from "../../src/recovery/schema.js";
const GUILD = "123456789012345678",
  EXECUTOR = "223456789012345678",
  MEMBER = "323456789012345678",
  OWNER = "423456789012345678";
const idAt = (time: number, suffix = 1n) =>
  (((BigInt(time) - 1420070400000n) << 22n) + suffix).toString();
function fixture(action: AuditLogEvent = AuditLogEvent.ChannelCreate) {
  const now = Date.now(),
    target = idAt(now),
    eventId = idAt(now, 2n),
    replacementId = idAt(now, 3n);
  const records = new Map<string, unknown>();
  const store: Store = {
    getConfig: () => ({
      mode: "protect",
      modules: {},
      incidentRetentionDays: 30,
      backupRetention: 10,
      backupIntervalHours: 0,
      lockdown: false,
    }),
    setConfig: () => {},
    get: <T>(g: string, c: string, id: string) =>
      records.get(`${g}/${c}/${id}`) as T | undefined,
    put: (g, c, id, value) => {
      records.set(`${g}/${c}/${id}`, structuredClone(value));
    },
    list: <T>(g: string, c: string) =>
      [...records]
        .filter(([key]) => key.startsWith(`${g}/${c}/`))
        .map(([, value]) => value as T),
    delete: (g, c, id) => {
      records.delete(`${g}/${c}/${id}`);
    },
    claim: (g, id) => {
      const key = `${g}/claims/${id}`;
      if (records.has(key)) return false;
      records.set(key, true);
      return true;
    },
    close: () => {},
  };
  const event: SecurityEvent = {
    id: eventId,
    guildId: GUILD,
    action: "channel.create",
    targetId: target,
    executorId: EXECUTOR,
    timestamp: now,
    source: "audit",
    auditAction: action,
    changes: {},
  };
  const permissions = { has: vi.fn(() => true), bitfield: 8n };
  const memberRoles = new Map([[target, { id: target }]]);
  const member = {
    id: MEMBER,
    bannable: true,
    roles: {
      cache: memberRoles,
      highest: { position: 1 },
      add: vi.fn(async (ids: string | string[]) => {
        for (const id of typeof ids === "string" ? [ids] : ids)
          memberRoles.set(id, { id });
      }),
      remove: vi.fn(async (ids: string[]) => {
        for (const id of ids) memberRoles.delete(id);
      }),
    },
  };
  const makeRole = (id: string) => ({
    id,
    guild: { id: GUILD },
    name: "changed",
    color: 0,
    hoist: false,
    mentionable: false,
    permissions: { bitfield: 8n },
    editable: true,
    managed: false,
    createdTimestamp: now,
    position: 1,
    delete: vi.fn(async () => {}),
    edit: vi.fn(async () => {}),
    setPosition: vi.fn(async () => {}),
  });
  const role = makeRole(target),
    replacement = makeRole(replacementId),
    everyone = makeRole(GUILD);
  const roles = new Map([
    [target, role],
    [GUILD, everyone],
  ]);
  const overwriteCache = new Map<
    string,
    {
      id: string;
      type: 0 | 1;
      allow: { bitfield: bigint };
      deny: { bitfield: bigint };
    }
  >();
  const channel = {
    id: target,
    guildId: GUILD,
    name: "changed",
    type: ChannelType.GuildText,
    createdTimestamp: now,
    deletable: true,
    parentId: null as string | null,
    rawPosition: 1,
    topic: "new topic",
    nsfw: false,
    rateLimitPerUser: 0,
    isThread: () => false,
    delete: vi.fn(async () => {}),
    edit: vi.fn(async () => {}),
    permissionOverwrites: {
      cache: overwriteCache,
      create: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    },
  };
  const channels = new Map([[target, channel]]);
  const exact = {
    id: eventId,
    action,
    targetId: target,
    executorId: EXECUTOR,
    createdTimestamp: now,
    extra: undefined as unknown,
  };
  const auditEntries = new Map([[eventId, exact]]);
  const guild = {
    id: GUILD,
    ownerId: OWNER,
    maximumBitrate: 96000,
    verificationLevel: 1,
    name: "changed",
    members: {
      fetchMe: vi.fn(async () => ({
        permissions,
        roles: { highest: { position: 10, comparePositionTo: () => 1 } },
      })),
      fetch: vi.fn(async () => member),
    },
    roles: {
      fetch: vi.fn(async (id?: string) =>
        id ? (roles.get(id) ?? null) : roles,
      ),
      create: vi.fn(async () => {
        roles.set(replacementId, replacement);
        return replacement;
      }),
    },
    channels: {
      fetch: vi.fn(async (id?: string) =>
        id ? (channels.get(id) ?? null) : channels,
      ),
      create: vi.fn(async () => ({ ...channel, id: replacementId })),
    },
    bans: {
      fetch: vi.fn(async () => ({ user: { id: target } })),
      remove: vi.fn(async () => null),
      create: vi.fn(async () => target),
    },
    fetchAuditLogs: vi.fn(async () => ({ entries: auditEntries })),
    edit: vi.fn(async () => {}),
    fetchWebhooks: vi.fn(
      async () =>
        new Map([
          [
            target,
            { id: target, guildId: GUILD, delete: vi.fn(async () => {}) },
          ],
        ]),
    ),
    autoModerationRules: {
      fetch: vi.fn(async () => ({
        id: target,
        guild: { id: GUILD },
        delete: vi.fn(async () => {}),
      })),
    },
  };
  const client = {
    guilds: { fetch: vi.fn(async () => guild) },
    user: { id: "523456789012345678" },
    rest: { put: vi.fn(async () => {}) },
  } as unknown as Client;
  const logger = { warn: vi.fn() } as unknown as Logger;
  const rollback = createRollbackEngine(client, store, logger),
    guard = vi.fn(async () => true);
  const snapshot: Snapshot = {
    version: 1,
    id: "11111111-1111-4111-8111-111111111111",
    guildId: GUILD,
    createdAt: now - 10000,
    guild: {
      name: "Original guild",
      verificationLevel: 1,
      explicitContentFilter: 0,
      defaultMessageNotifications: 0,
    },
    roles: [
      {
        id: target,
        name: "original role",
        permissions: "8",
        color: 123,
        hoist: true,
        mentionable: false,
        position: 2,
        managed: false,
      },
      {
        id: GUILD,
        name: "@everyone",
        permissions: "0",
        color: 0,
        hoist: false,
        mentionable: false,
        position: 0,
        managed: false,
      },
    ],
    channels: [
      {
        id: target,
        name: "original channel",
        type: 0,
        parentId: null,
        position: 2,
        topic: "saved topic",
        nsfw: false,
        rateLimitPerUser: 3,
        bitrate: 0,
        userLimit: 0,
        overwrites: [{ id: GUILD, type: 0, allow: "0", deny: "1024" }],
      },
    ],
    skippedChannels: [],
  };
  const baseline = () => {
    store.put(GUILD, "backups", snapshot.id, snapshot);
    approveSnapshot(store, GUILD, snapshot.id, now - 5000);
  };
  return {
    now,
    target,
    eventId,
    replacementId,
    store,
    records,
    event,
    permissions,
    member,
    role,
    roles,
    replacement,
    channel,
    channels,
    exact,
    auditEntries,
    guild,
    client,
    rollback,
    guard,
    snapshot,
    baseline,
    logger,
  };
}
describe("centralized anti-nuke rollback", () => {
  it("does not claim an applied intervention when the created target is already absent", async () => {
    const f = fixture();
    f.channels.delete(f.target);
    expect(await f.rollback(f.event, f.guard)).toMatchObject({
      status: "succeeded",
      effectsApplied: false,
    });
    expect(f.channel.delete).not.toHaveBeenCalled();
  });
  it("distinguishes a definite API rejection from a successful intervention or uncertain send", async () => {
    const f = fixture();
    f.channel.delete.mockRejectedValueOnce({ code: 50013 });
    expect(await f.rollback(f.event, f.guard)).toMatchObject({
      status: "failed",
      effectsApplied: false,
    });
    const g = fixture();
    g.channel.delete.mockRejectedValueOnce(new Error("Connection lost"));
    expect(await g.rollback(g.event, g.guard)).toMatchObject({
      status: "uncertain",
      effectsApplied: false,
    });
  });
  it("does not restore dangerous shared-role permissions held by a previously contained executor", async () => {
    const f = fixture(AuditLogEvent.RoleUpdate);
    f.role.permissions.bitfield = 0n;
    f.event.changes = { permissions: { old: "8", new: "0" } };
    f.store.put(GUILD, "containment_records", MEMBER, {
      executorId: MEMBER,
      status: "failed",
    });
    expect(await f.rollback(f.event, f.guard)).toMatchObject({
      status: "skipped",
    });
    expect(f.role.edit).not.toHaveBeenCalled();
  });
  it("does not rearm a different previously contained attacker from a membership snapshot", async () => {
    const f = fixture(AuditLogEvent.RoleDelete);
    f.roles.delete(f.target);
    f.baseline();
    f.store.put(GUILD, "trusted_history", `members:${f.target}`, {
      guildId: GUILD,
      roleId: f.target,
      observedAt: f.now - 1000,
      complete: true,
      memberIds: [MEMBER],
    });
    f.store.put(GUILD, "containment_records", MEMBER, {
      executorId: MEMBER,
      status: "contained",
    });
    expect(await f.rollback(f.event, f.guard)).toMatchObject({
      status: "partial",
      newId: f.replacementId,
    });
    expect(f.member.roles.add).not.toHaveBeenCalled();
  });
  it("does not restore member roles to a previously contained target", async () => {
    const f = fixture(AuditLogEvent.MemberRoleUpdate);
    f.event.changes = { $remove: { new: [{ id: f.target }] } };
    f.member.roles.cache.clear();
    f.store.put(GUILD, "containment_records", f.event.targetId!, {
      executorId: f.event.targetId,
      status: "partial",
    });
    expect(await f.rollback(f.event, f.guard)).toMatchObject({
      status: "partial",
    });
    expect(f.member.roles.add).not.toHaveBeenCalled();
  });
  it("does not compete with an in-flight manual restore for replacement objects", async () => {
    const f = fixture(AuditLogEvent.ChannelDelete);
    f.channels.delete(f.target);
    f.baseline();
    const release = acquireRecoveryOperation(f.store, GUILD);
    try {
      expect(await f.rollback(f.event, f.guard)).toMatchObject({
        status: "failed",
      });
      expect(f.guild.channels.create).not.toHaveBeenCalled();
    } finally {
      release();
    }
    const next = { ...f.event, id: idAt(f.now, 99n) };
    f.auditEntries.set(next.id, { ...f.exact, id: next.id });
    f.auditEntries.delete(f.event.id);
    expect(await f.rollback(next, f.guard)).toMatchObject({
      status: "partial",
    });
    expect(f.guild.channels.create).toHaveBeenCalledOnce();
  });
  it("stops a member-role rollback when Monitor is selected during the final member read", async () => {
    const f = fixture(AuditLogEvent.MemberRoleUpdate);
    let allowed = true,
      calls = 0;
    f.guard.mockImplementation(async () => allowed);
    f.event.changes = { $add: { new: [{ id: f.target }] } };
    f.guild.members.fetch.mockImplementation(async () => {
      calls++;
      if (calls === 2) allowed = false;
      return f.member;
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.member.roles.remove).not.toHaveBeenCalled();
  });
  it("does not delete a created channel after a later authorized update of another audit type", async () => {
    const f = fixture();
    f.auditEntries.set(idAt(f.now + 5), {
      ...f.exact,
      id: idAt(f.now + 5),
      action: AuditLogEvent.ChannelUpdate,
      createdTimestamp: f.now + 5,
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.channel.delete).not.toHaveBeenCalled();
    expect(f.guild.fetchAuditLogs).toHaveBeenCalledWith({ limit: 100 });
  });

  it("restores a changed overwrite without replacing unrelated principals", async () => {
    const f = fixture(AuditLogEvent.ChannelOverwriteUpdate);
    f.event.overwrite = { id: MEMBER, type: 1 };
    f.exact.extra = { id: MEMBER, type: "1" };
    f.channel.permissionOverwrites.cache.set(MEMBER, {
      id: MEMBER,
      type: 1,
      allow: { bitfield: 8n },
      deny: { bitfield: 1024n },
    });
    f.event.changes = { allow: { old: "0", new: "8" } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.client.rest.put).toHaveBeenCalledWith(
      "/channels/" + f.target + "/permissions/" + MEMBER,
      {
        body: { type: 1, allow: "0", deny: "1024" },
        reason: expect.any(String),
      },
    );
  });
  it("removes only an exactly matching newly-created overwrite", async () => {
    const f = fixture(AuditLogEvent.ChannelOverwriteCreate);
    f.event.overwrite = { id: MEMBER, type: 1 };
    f.exact.extra = { id: MEMBER, type: 1 };
    f.channel.permissionOverwrites.cache.set(MEMBER, {
      id: MEMBER,
      type: 1,
      allow: { bitfield: 8n },
      deny: { bitfield: 0n },
    });
    f.event.changes = { allow: { new: "8" }, deny: { new: "0" } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.channel.permissionOverwrites.delete).toHaveBeenCalledWith(
      MEMBER,
      expect.any(String),
    );
  });
  it("recreates a deleted overwrite from exact previous permission masks", async () => {
    const f = fixture(AuditLogEvent.ChannelOverwriteDelete);
    f.event.overwrite = { id: MEMBER, type: 1 };
    f.exact.extra = { id: MEMBER, type: "1" };
    f.event.changes = { allow: { old: "1024" }, deny: { old: "0" } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.client.rest.put).toHaveBeenCalledWith(
      "/channels/" + f.target + "/permissions/" + MEMBER,
      {
        body: { type: 1, allow: "1024", deny: "0" },
        reason: expect.any(String),
      },
    );
  });
  it("refuses overwrite reversal without verified principal metadata", async () => {
    const f = fixture(AuditLogEvent.ChannelOverwriteUpdate);
    f.event.changes = { allow: { old: "0", new: "8" } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("unsupported");
    expect(f.client.rest.put).not.toHaveBeenCalled();
  });
  it("uses the latest trusted ban baseline instead of stale per-target history", async () => {
    const f = fixture(AuditLogEvent.MemberBanAdd);
    f.store.put(GUILD, "trusted_history", "ban:" + f.target, {
      version: 1,
      kind: "ban",
      guildId: GUILD,
      targetId: f.target,
      exists: false,
      observedAt: f.now - 10000,
    });
    f.store.put(GUILD, "trusted_history", "bans:baseline", {
      guildId: GUILD,
      observedAt: f.now - 1000,
      complete: true,
      bannedIds: [f.target],
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("unsupported");
    expect(f.guild.bans.remove).not.toHaveBeenCalled();
  });
  it("removes an exactly attributed newly-created webhook", async () => {
    const f = fixture(AuditLogEvent.WebhookCreate);
    const remove = vi.fn(async () => {});
    f.guild.fetchWebhooks.mockResolvedValue(
      new Map([[f.target, { id: f.target, guildId: GUILD, delete: remove }]]),
    );
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("removes an exactly attributed newly-created AutoMod rule", async () => {
    const f = fixture(AuditLogEvent.AutoModerationRuleCreate);
    const remove = vi.fn(async () => {});
    f.guild.autoModerationRules.fetch.mockResolvedValue({
      id: f.target,
      guild: { id: GUILD },
      delete: remove,
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("deletes only a freshly created, exactly attributed channel and persists the attempt", async () => {
    const f = fixture();
    const result = await f.rollback(f.event, f.guard);
    expect(result.status).toBe("succeeded");
    expect(f.channel.delete).toHaveBeenCalledTimes(1);
    expect(f.store.get(GUILD, "rollback_attempts", f.eventId)).toMatchObject({
      state: "done",
      phase: "delete-created-channel",
    });
  });
  it("handles dangerous role creation by audit action even when classified role.permissions", async () => {
    const f = fixture(AuditLogEvent.RoleCreate);
    f.event.action = "role.permissions";
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.role.delete).toHaveBeenCalledTimes(1);
  });
  it("rejects an executor mismatch instead of deleting another target", async () => {
    const f = fixture();
    f.exact.executorId = "623456789012345678";
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.channel.delete).not.toHaveBeenCalled();
  });
  it("does not turn a gateway departure or missing audit record into rollback", async () => {
    const f = fixture(AuditLogEvent.MemberKick);
    f.event.source = "gateway";
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.guild.fetchAuditLogs).not.toHaveBeenCalled();
  });
  it("refuses an old target whose creation timestamp does not match the create event", async () => {
    const f = fixture();
    f.channel.createdTimestamp -= 20000;
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.channel.delete).not.toHaveBeenCalled();
  });
  it("honors a mode or whitelist change immediately before an external effect", async () => {
    const f = fixture();
    f.guard.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.channel.delete).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent and later duplicate events", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([
      f.rollback(f.event, f.guard),
      f.rollback(f.event, f.guard),
    ]);
    expect(a).toEqual(b);
    await f.rollback(f.event, f.guard);
    expect(f.channel.delete).toHaveBeenCalledTimes(1);
  });
  it("does not replay an uncertain pre-crash rollback", async () => {
    const f = fixture();
    f.store.put(GUILD, "rollback_attempts", f.eventId, {
      version: 1,
      state: "pending",
      strategy: "delete-created",
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("uncertain");
    expect(f.channel.delete).not.toHaveBeenCalled();
  });
  it("records uncertain REST failure without repeated API requests", async () => {
    const f = fixture();
    f.channel.delete.mockRejectedValue(new Error("ECONNRESET"));
    expect((await f.rollback(f.event, f.guard)).status).toBe("uncertain");
    expect((await f.rollback(f.event, f.guard)).status).toBe("uncertain");
    expect(f.channel.delete).toHaveBeenCalledTimes(1);
  });
  it("respects missing permissions and role hierarchy", async () => {
    const f = fixture(AuditLogEvent.RoleCreate);
    f.role.editable = false;
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.role.delete).not.toHaveBeenCalled();
    const g = fixture();
    g.permissions.has.mockReturnValue(false);
    expect((await g.rollback(g.event, g.guard)).status).toBe("failed");
    expect(g.channel.delete).not.toHaveBeenCalled();
  });
  it("recreates only the deleted channel from a trusted snapshot and stores its mapping", async () => {
    const f = fixture(AuditLogEvent.ChannelDelete);
    f.channels.delete(f.target);
    f.baseline();
    const result = await f.rollback(f.event, f.guard);
    expect(result).toMatchObject({ status: "partial", newId: f.replacementId });
    expect(f.guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "original channel",
        topic: "saved topic",
        position: 2,
        permissionOverwrites: [
          expect.objectContaining({ id: GUILD, deny: 1024n }),
        ],
      }),
    );
    expect(
      f.store.get(GUILD, "restore_mappings", `${f.snapshot.id}:${f.target}`),
    ).toMatchObject({ newId: f.replacementId });
    expect(f.guild.roles.create).not.toHaveBeenCalled();
  });
  it("does not use corrupted or unapproved snapshots", async () => {
    const f = fixture(AuditLogEvent.ChannelDelete);
    f.channels.clear();
    f.baseline();
    f.snapshot.channels[0]!.name = "corrupted";
    f.store.put(GUILD, "backups", f.snapshot.id, f.snapshot);
    expect((await f.rollback(f.event, f.guard)).status).toBe("unsupported");
    expect(f.guild.channels.create).not.toHaveBeenCalled();
  });
  it("refuses to recreate a channel when its saved category is missing", async () => {
    const f = fixture(AuditLogEvent.ChannelDelete);
    f.channels.clear();
    f.snapshot.channels[0]!.parentId = "623456789012345678";
    f.baseline();
    expect((await f.rollback(f.event, f.guard)).status).toBe("failed");
    expect(f.guild.channels.create).not.toHaveBeenCalled();
  });
  it("recreates a deleted role with position while reporting missing member snapshots", async () => {
    const f = fixture(AuditLogEvent.RoleDelete);
    f.roles.delete(f.target);
    f.baseline();
    const result = await f.rollback(f.event, f.guard);
    expect(result).toMatchObject({ status: "partial", newId: f.replacementId });
    expect(f.guild.roles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "original role",
        color: 123,
        permissions: 8n,
        hoist: true,
      }),
    );
    expect(f.replacement.setPosition).toHaveBeenCalledWith(
      2,
      expect.any(Object),
    );
    expect(f.member.roles.add).not.toHaveBeenCalled();
  });
  it("reassigns replacement roles only from complete trusted membership evidence", async () => {
    const f = fixture(AuditLogEvent.RoleDelete);
    f.roles.delete(f.target);
    f.baseline();
    f.store.put(GUILD, "trusted_history", `members:${f.target}`, {
      guildId: GUILD,
      roleId: f.target,
      observedAt: f.now - 1000,
      complete: true,
      memberIds: [MEMBER],
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.member.roles.add).toHaveBeenCalledWith(
      f.replacementId,
      expect.any(String),
    );
  });
  it("reverses audited channel fields while preserving unrelated properties", async () => {
    const f = fixture(AuditLogEvent.ChannelUpdate);
    f.event.changes = { name: { old: "original", new: "changed" } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.channel.edit).toHaveBeenCalledWith({
      name: "original",
      reason: expect.any(String),
    });
  });
  it("refuses channel reversal after a newer legitimate value appears", async () => {
    const f = fixture(AuditLogEvent.ChannelUpdate);
    f.event.changes = { name: { old: "original", new: "attacked" } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("failed");
    expect(f.channel.edit).not.toHaveBeenCalled();
  });
  it("restores role color, hoist and mentionability from exact audited values", async () => {
    const f = fixture(AuditLogEvent.RoleUpdate);
    f.event.changes = {
      color: { old: 123, new: 0 },
      hoist: { old: true, new: false },
      mentionable: { old: true, new: false },
    };
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.role.edit).toHaveBeenCalledWith({
      color: 123,
      hoist: true,
      mentionable: true,
      reason: expect.any(String),
    });
  });
  it("unbans only a confirmed new ban with trustworthy pre-incident absence", async () => {
    const f = fixture(AuditLogEvent.MemberBanAdd);
    f.store.put(GUILD, "trusted_history", "bans:baseline", {
      guildId: GUILD,
      observedAt: f.now - 1000,
      complete: true,
      bannedIds: [],
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.guild.bans.remove).toHaveBeenCalledWith(
      f.target,
      expect.any(String),
    );
  });
  it("never unbans a target already legitimately banned before the incident", async () => {
    const f = fixture(AuditLogEvent.MemberBanAdd);
    f.store.put(GUILD, "trusted_history", "bans:baseline", {
      guildId: GUILD,
      observedAt: f.now - 1000,
      complete: true,
      bannedIds: [f.target],
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("unsupported");
    expect(f.guild.bans.remove).not.toHaveBeenCalled();
  });
  it("does not guess prior ban state when baseline history is absent", async () => {
    const f = fixture(AuditLogEvent.MemberBanAdd);
    expect((await f.rollback(f.event, f.guard)).status).toBe("unsupported");
    expect(f.guild.bans.remove).not.toHaveBeenCalled();
  });
  it("restores an unauthorized unban only with reliable previous ban evidence", async () => {
    const f = fixture(AuditLogEvent.MemberBanRemove);
    f.store.put(GUILD, "trusted_history", `ban:${f.target}`, {
      version: 1,
      kind: "ban",
      guildId: GUILD,
      targetId: f.target,
      exists: true,
      observedAt: f.now - 1000,
    });
    f.guild.bans.fetch.mockRejectedValue({ code: 10026 });
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.guild.bans.create).toHaveBeenCalledWith(f.target, {
      reason: expect.any(String),
      deleteMessageSeconds: 0,
    });
  });
  it("reports confirmed kicks without pretending to force rejoin", async () => {
    const f = fixture(AuditLogEvent.MemberKick);
    const result = await f.rollback(f.event, f.guard);
    expect(result.status).toBe("unsupported");
    expect(result.result).toContain("cannot force rejoin");
  });
  it("reverses only role-assignment deltas and preserves unrelated roles", async () => {
    const f = fixture(AuditLogEvent.MemberRoleUpdate);
    f.event.changes = { $add: { new: [{ id: f.target }] } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.member.roles.remove).toHaveBeenCalledWith(
      [f.target],
      expect.any(String),
    );
    expect(f.member.roles.add).not.toHaveBeenCalled();
  });
  it("does not regrant dangerous removed roles to the contained executor", async () => {
    const f = fixture(AuditLogEvent.MemberRoleUpdate);
    f.member.id = EXECUTOR;
    f.event.targetId = EXECUTOR;
    f.exact.targetId = EXECUTOR;
    f.member.roles.cache.clear();
    f.event.changes = { $remove: { new: [{ id: f.target }] } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.member.roles.add).not.toHaveBeenCalled();
  });
  it("restores supported guild fields through exact-value reversal", async () => {
    const f = fixture(AuditLogEvent.GuildUpdate);
    f.event.targetId = GUILD;
    f.exact.targetId = GUILD;
    f.event.changes = { name: { old: "Original guild", new: "changed" } };
    expect((await f.rollback(f.event, f.guard)).status).toBe("succeeded");
    expect(f.guild.edit).toHaveBeenCalledWith({
      name: "Original guild",
      reason: expect.any(String),
    });
  });
  it("does not rollback a target with a newer audit action", async () => {
    const f = fixture();
    f.auditEntries.set(idAt(f.now + 10), {
      ...f.exact,
      id: idAt(f.now + 10),
      createdTimestamp: f.now + 10,
    });
    expect((await f.rollback(f.event, f.guard)).status).toBe("skipped");
    expect(f.channel.delete).not.toHaveBeenCalled();
  });
  it("records explicit unsupported outcomes rather than claiming webhook update rollback", async () => {
    const f = fixture(AuditLogEvent.WebhookUpdate);
    const result = await f.rollback(f.event, f.guard);
    expect(result.status).toBe("unsupported");
    expect(f.store.get(GUILD, "rollback_attempts", f.eventId)).toMatchObject({
      state: "done",
      outcome: { status: "unsupported" },
    });
  });
});
