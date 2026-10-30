import { describe, expect, it, vi } from "vitest";
import {
  createBackupService,
  journaledCreate,
} from "../../src/recovery/index.js";
import {
  validateSnapshot,
  parseScope,
  type Snapshot,
} from "../../src/recovery/schema.js";
import type { Store } from "../../src/contracts.js";
import type { Client } from "discord.js";
import type { Logger } from "pino";
function memoryStore(): Store {
  const records = new Map<string, unknown>();
  return {
    getConfig: () => ({
      mode: "monitor",
      modules: {},
      incidentRetentionDays: 30,
      backupRetention: 2,
      backupIntervalHours: 0,
      lockdown: false,
    }),
    setConfig: () => {},
    get: <T>(g: string, c: string, id: string) =>
      records.get(`${g}/${c}/${id}`) as T | undefined,
    put: (g, c, id, value) => {
      records.set(`${g}/${c}/${id}`, value);
    },
    list: <T>(g: string, c: string) =>
      [...records.entries()]
        .filter(([k]) => k.startsWith(`${g}/${c}/`))
        .map(([, v]) => v as T),
    delete: (g, c, id) => {
      records.delete(`${g}/${c}/${id}`);
    },
    claim: () => true,
    close: () => {},
  };
}
const sample = (): Snapshot => ({
  version: 1,
  id: "e15ec9ae-e9db-4706-8b04-0895147cc449",
  guildId: "100",
  createdAt: 123,
  guild: {
    name: "Example",
    verificationLevel: 1,
    explicitContentFilter: 1,
    defaultMessageNotifications: 1,
  },
  roles: [
    {
      id: "200",
      name: "Member",
      permissions: "0",
      color: 0,
      hoist: false,
      mentionable: false,
      position: 1,
      managed: false,
    },
  ],
  channels: [],
  skippedChannels: [],
});
function fixture() {
  const store = memoryStore(),
    roles = new Map<string, unknown>(),
    channels = new Map<string, unknown>();
  const createRole = vi.fn(async () => {
    const role = { id: "300", editable: true, edit: vi.fn() };
    roles.set(role.id, role);
    return role;
  });
  const me = { permissions: { has: () => true } };
  const guild = {
    id: "100",
    name: "Example",
    verificationLevel: 1,
    explicitContentFilter: 1,
    defaultMessageNotifications: 1,
    roles: {
      cache: roles,
      fetch: vi.fn(async () => new Map(roles)),
      create: createRole,
    },
    channels: {
      cache: channels,
      fetch: vi.fn(async () => new Map(channels)),
      create: vi.fn(),
    },
    members: { fetchMe: vi.fn(async () => me), me },
    edit: vi.fn(),
    maximumBitrate: 96000,
  };
  const client = {
    guilds: { fetch: vi.fn(async () => guild) },
  } as unknown as Client;
  const logger = { error: vi.fn() } as unknown as Logger;
  store.put("100", "backups", sample().id, sample());
  return {
    store,
    guild,
    createRole,
    service: createBackupService(client, store, logger),
    client,
    logger,
  };
}
describe("snapshot validation", () => {
  it("rejects cross guild restore", () =>
    expect(() => validateSnapshot(sample(), "999")).toThrow("another guild"));
  it("rejects invalid permission encodings", () => {
    const s = sample();
    s.roles[0]!.permissions = "-1";
    expect(() => validateSnapshot(s, "100")).toThrow();
  });
  it("rejects duplicate source IDs", () => {
    const s = sample();
    s.roles.push({ ...s.roles[0]! });
    expect(() => validateSnapshot(s, "100")).toThrow("Duplicate");
  });
  it("rejects invalid scopes", () =>
    expect(() => parseScope("delete")).toThrow());
});
describe("durable create journal", () => {
  it("does not repeat a completed create", async () => {
    const store = memoryStore(),
      create = vi.fn(async () => "123");
    expect(await journaledCreate(store, "1", "a", create)).toBe("123");
    expect(await journaledCreate(store, "1", "a", create)).toBe("123");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("blocks an uncertain create after restart", async () => {
    const store = memoryStore(),
      create = vi.fn(async () => {
        throw new Error("Connection lost");
      });
    await expect(journaledCreate(store, "1", "a", create)).rejects.toThrow(
      "Connection",
    );
    await expect(journaledCreate(store, "1", "a", create)).rejects.toThrow(
      "Uncertain",
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("does not call Discord if journal persistence fails", async () => {
    const store = memoryStore(),
      create = vi.fn(async () => "123");
    store.put = () => {
      throw new Error("Disk full");
    };
    await expect(journaledCreate(store, "1", "a", create)).rejects.toThrow(
      "Disk full",
    );
    expect(create).not.toHaveBeenCalled();
  });
  it("isolates identical operation keys across guilds", async () => {
    const store = memoryStore(),
      create = vi.fn(async () => "123");
    await journaledCreate(store, "1", "a", create);
    await journaledCreate(store, "2", "a", create);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
describe("restore orchestration", () => {
  it("restores missing roles once and persists mapping across service restart", async () => {
    const f = fixture();
    expect(await f.service.restore("100", sample().id, "roles")).toContain(
      "restored",
    );
    const restarted = createBackupService(f.client, f.store, f.logger);
    await restarted.restore("100", sample().id, "roles");
    expect(f.createRole).toHaveBeenCalledTimes(1);
    expect(
      f.store.get("100", "restore_mappings", `${sample().id}:200`),
    ).toEqual({ oldId: "200", newId: "300" });
  });
  it("previews without creating objects", async () => {
    const f = fixture();
    expect(await f.service.preview("100", sample().id, "roles")).toContain(
      "Missing roles: 1",
    );
    expect(f.createRole).not.toHaveBeenCalled();
  });
  it("respects hierarchy on existing roles", async () => {
    const f = fixture(),
      edit = vi.fn();
    f.guild.roles.cache.set("200", { id: "200", editable: false, edit });
    expect(await f.service.restore("100", sample().id, "roles")).toContain(
      "hierarchy",
    );
    expect(edit).not.toHaveBeenCalled();
  });
  it("refuses missing permissions", async () => {
    const f = fixture();
    f.guild.members.me.permissions.has = () => false;
    await expect(
      f.service.restore("100", sample().id, "roles"),
    ).rejects.toThrow("Manage Roles");
    expect(f.createRole).not.toHaveBeenCalled();
  });
  it("does not restore role assignments or unrelated scope", async () => {
    const f = fixture();
    await f.service.restore("100", sample().id, "guild");
    expect(f.createRole).not.toHaveBeenCalled();
    expect(f.guild.edit).toHaveBeenCalledTimes(1);
  });
  it("persists failures for review without duplicate retry", async () => {
    const f = fixture();
    f.createRole.mockRejectedValueOnce(new Error("API unavailable"));
    expect(await f.service.restore("100", sample().id, "roles")).toContain(
      "API unavailable",
    );
    expect(await f.service.restore("100", sample().id, "roles")).toContain(
      "Uncertain",
    );
    expect(f.createRole).toHaveBeenCalledTimes(1);
  });
});

describe("channel relationship restoration", () => {
  const category = (
    id: string,
    parentId: string | null = null,
  ): Snapshot["channels"][number] => ({
    id,
    name: "category",
    type: 4,
    parentId,
    position: 0,
    topic: null,
    nsfw: false,
    rateLimitPerUser: 0,
    bitrate: 0,
    userLimit: 0,
    overwrites: [],
  });
  it("maps recreated categories before creating their child channels", async () => {
    const f = fixture(),
      s = sample();
    s.roles = [];
    s.channels = [
      { ...category("401", "400"), name: "text", type: 0 },
      category("400"),
    ];
    f.store.put("100", "backups", s.id, s);
    f.guild.channels.create.mockImplementation(
      async (data: { name: string; parent: string | null; type: number }) => {
        const id = data.name === "category" ? "500" : "501";
        const channel = { id, type: data.type, edit: vi.fn() };
        f.guild.channels.cache.set(id, channel);
        return channel;
      },
    );
    const result = await f.service.restore("100", s.id, "channels");
    expect(result).toContain("Channel 401: restored");
    expect(f.guild.channels.create.mock.calls[1]?.[0]).toMatchObject({
      parent: "500",
    });
  });
  it("does not drop missing role overwrites to force restoration", async () => {
    const f = fixture(),
      s = sample();
    s.channels = [
      {
        ...category("400"),
        overwrites: [{ id: "999", type: 0, allow: "0", deny: "1024" }],
      },
    ];
    f.store.put("100", "backups", s.id, s);
    expect(await f.service.restore("100", s.id, "channels")).toContain(
      "Overwrite role 999 missing",
    );
    expect(f.guild.channels.create).not.toHaveBeenCalled();
  });
  it("does not recreate or claim success for a deleted previously-restored object", async () => {
    const f = fixture();
    await f.service.restore("100", sample().id, "roles");
    f.guild.roles.cache.delete("300");
    expect(await f.service.restore("100", sample().id, "roles")).toContain(
      "manual reconciliation",
    );
    expect(f.createRole).toHaveBeenCalledTimes(1);
  });
});

describe("authoritative recovery reads and shared operation lock", () => {
  it("ignores a stale deleted role in the manager cache when restoring", async () => {
    const f = fixture(),
      edit = vi.fn();
    f.guild.roles.cache.set("200", { id: "200", editable: true, edit });
    f.guild.roles.fetch.mockResolvedValue(new Map());
    expect(await f.service.restore("100", sample().id, "roles")).toContain(
      "Role 200: restored",
    );
    expect(edit).not.toHaveBeenCalled();
    expect(f.createRole).toHaveBeenCalledTimes(1);
  });
  it("ignores stale deleted channels and overwrites roles in preview", async () => {
    const f = fixture(),
      s = sample();
    s.channels = [
      {
        id: "400",
        name: "text",
        type: 0,
        parentId: null,
        position: 0,
        topic: null,
        nsfw: false,
        rateLimitPerUser: 0,
        bitrate: 0,
        userLimit: 0,
        overwrites: [],
      },
    ];
    f.store.put("100", "backups", s.id, s);
    f.guild.roles.cache.set("200", { id: "200" });
    f.guild.channels.cache.set("400", { id: "400" });
    f.guild.roles.fetch.mockResolvedValue(new Map());
    f.guild.channels.fetch.mockResolvedValue(new Map());
    expect(await f.service.preview("100", s.id)).toContain(
      "Missing roles: 1; missing channels: 1",
    );
  });
  it("snapshots returned resources instead of stale deleted manager cache objects", async () => {
    const f = fixture();
    f.guild.roles.cache.set("999", { id: "999" });
    f.guild.channels.cache.set("999", { id: "999" });
    f.guild.roles.fetch.mockResolvedValue(new Map());
    f.guild.channels.fetch.mockResolvedValue(new Map());
    const result = await f.service.create("100");
    const saved = f.store.get<Snapshot>("100", "backups", result.id)!;
    expect(saved.roles).toEqual([]);
    expect(saved.channels).toEqual([]);
  });
  it("updates authoritative collections with newly created roles for channel overwrites", async () => {
    const f = fixture(),
      s = sample();
    s.channels = [
      {
        id: "400",
        name: "text",
        type: 0,
        parentId: null,
        position: 0,
        topic: null,
        nsfw: false,
        rateLimitPerUser: 0,
        bitrate: 0,
        userLimit: 0,
        overwrites: [{ id: "200", type: 0, allow: "0", deny: "1024" }],
      },
    ];
    f.store.put("100", "backups", s.id, s);
    f.guild.channels.create.mockImplementation(async () => ({
      id: "500",
      type: 0,
      edit: vi.fn(),
    }));
    expect(await f.service.restore("100", s.id, "all")).toContain(
      "Channel 400: restored",
    );
    expect(f.guild.channels.create.mock.calls[0]?.[0]).toMatchObject({
      permissionOverwrites: [{ id: "300", type: 0, allow: 0n, deny: 1024n }],
    });
  });
  it("blocks restore and another snapshot while a snapshot fetch is pending, including another service", async () => {
    const f = fixture();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.guild.roles.fetch.mockImplementationOnce(async () => {
      await waiting;
      return new Map();
    });
    const running = f.service.create("100");
    const other = createBackupService(f.client, f.store, f.logger);
    await expect(other.restore("100", sample().id, "roles")).rejects.toThrow(
      "already running",
    );
    await expect(other.create("100")).rejects.toThrow("already running");
    release();
    await running;
    expect(f.createRole).not.toHaveBeenCalled();
  });
  it("releases snapshot lock after an API read fails", async () => {
    const f = fixture();
    f.guild.roles.fetch.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(f.service.create("100")).rejects.toThrow("Unavailable");
    await expect(f.service.create("100")).resolves.toHaveProperty("id");
  });
});
