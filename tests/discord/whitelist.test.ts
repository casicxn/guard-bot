import { AuthorizationService } from "../../src/control/authorization.js";
import type { Store } from "../../src/contracts.js";
import type { Logger } from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Guild } from "discord.js";
import type { WhitelistEntry } from "../../src/contracts.js";
import { SqliteStore } from "../../src/database/index.js";
import { isWhitelisted } from "../../src/security/index.js";
import {
  addWhitelist,
  listWhitelist,
  removeWhitelist,
  validateWhitelistSubject,
} from "../../src/discord/whitelist.js";
const actor = {
  userId: "999999999999999999",
  authorization: new AuthorizationService(
    "999999999999999999",
    {} as Store,
    {} as Logger,
  ),
};
const subjectId = "123456789012345678";
const guildId = "223456789012345678";
const otherGuildId = "323456789012345678";
const openStores: SqliteStore[] = [];
afterEach(() => {
  for (const store of openStores.splice(0)) store.close();
});
function fixture(kind: "user" | "role" | "bot" = "user") {
  const store = new SqliteStore(":memory:");
  openStores.push(store);
  const role = { id: subjectId, guild: { id: guildId } };
  const member = {
    id: subjectId,
    guild: { id: guildId },
    user: { bot: kind === "bot" },
  };
  const roles = new Map(kind === "role" ? [[subjectId, role]] : []);
  const roleFetch = vi.fn(async () => roles);
  const memberFetch = vi.fn(async () => member);
  const guild = {
    id: guildId,
    roles: { fetch: roleFetch },
    members: { fetch: memberFetch },
  } as unknown as Guild;
  return { store, guild, roleFetch, memberFetch, member, role };
}
describe("whitelist ID recognition", () => {
  it("rejects unauthorized direct service access before lookup or mutation", async () => {
    const f = fixture();
    const denied = { ...actor, userId: "888888888888888888" };
    await expect(
      addWhitelist(f.store, f.guild, subjectId, denied),
    ).rejects.toMatchObject({ key: "error.owner" });
    expect(() => listWhitelist(f.store, guildId, denied)).toThrow();
    expect(() =>
      removeWhitelist(f.store, guildId, subjectId, denied),
    ).toThrow();
    expect(f.roleFetch).not.toHaveBeenCalled();
    expect(f.store.list(guildId, "whitelist")).toEqual([]);
  });
  it("records grant time and granting instance owner", async () => {
    const f = fixture();
    const before = Date.now();
    const result = await addWhitelist(f.store, f.guild, subjectId, actor);
    expect(result.entry.addedAt).toBeGreaterThanOrEqual(before);
    expect(result.entry.addedBy).toBe(actor.userId);
  });
  it.each([
    "",
    "Example",
    "<@123456789012345678>",
    "0",
    "000000000000000000",
    "1234567890123456",
    "18446744073709551616",
    "1234567890123456789012",
  ])("rejects invalid snowflake %s before any lookup", async (id) => {
    const f = fixture();
    await expect(
      addWhitelist(f.store, f.guild, id, actor),
    ).rejects.toMatchObject({
      key: "whitelist.invalidId",
    });
    expect(f.roleFetch).not.toHaveBeenCalled();
    expect(f.memberFetch).not.toHaveBeenCalled();
  });
  it("accepts a trimmed valid unsigned snowflake", () =>
    expect(validateWhitelistSubject(` ${subjectId} `)).toBe(subjectId));
  it("recognizes current guild roles before members", async () => {
    const f = fixture("role"),
      result = await addWhitelist(f.store, f.guild, subjectId, actor);
    expect(result.entry).toMatchObject({
      kind: "role",
      subjectId,
      actions: ["*"],
    });
    expect(f.roleFetch).toHaveBeenCalledOnce();
    expect(f.memberFetch).not.toHaveBeenCalled();
  });
  it.each(["user", "bot"] as const)(
    "recognizes a fresh guild %s",
    async (kind) => {
      const f = fixture(kind),
        result = await addWhitelist(f.store, f.guild, subjectId, actor);
      expect(result.entry.kind).toBe(kind);
      expect(result.entry.actions).toEqual(["*"]);
      expect(result.entry.expiresAt).toBeUndefined();
      expect(f.memberFetch).toHaveBeenCalledWith({
        user: subjectId,
        force: true,
      });
    },
  );
  it("does not guess membership after a role API failure", async () => {
    const f = fixture();
    f.roleFetch.mockRejectedValueOnce({ code: 50013 });
    await expect(
      addWhitelist(f.store, f.guild, subjectId, actor),
    ).rejects.toMatchObject({ key: "whitelist.lookupFailed" });
    expect(f.memberFetch).not.toHaveBeenCalled();
    expect(listWhitelist(f.store, guildId, actor)).toEqual([]);
  });
  it("reports unknown member without trusting an outside-guild ID", async () => {
    const f = fixture();
    f.memberFetch.mockRejectedValueOnce({ code: 10007 });
    await expect(
      addWhitelist(f.store, f.guild, subjectId, actor),
    ).rejects.toMatchObject({ key: "whitelist.notFound" });
    expect(listWhitelist(f.store, guildId, actor)).toEqual([]);
  });
  it("reports member lookup outages distinctly", async () => {
    const f = fixture();
    f.memberFetch.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(
      addWhitelist(f.store, f.guild, subjectId, actor),
    ).rejects.toMatchObject({ key: "whitelist.lookupFailed" });
    expect(listWhitelist(f.store, guildId, actor)).toEqual([]);
  });
  it("rejects a member response from another guild", async () => {
    const f = fixture();
    f.member.guild.id = otherGuildId;
    await expect(
      addWhitelist(f.store, f.guild, subjectId, actor),
    ).rejects.toMatchObject({ key: "whitelist.lookupFailed" });
    expect(listWhitelist(f.store, guildId, actor)).toEqual([]);
  });
  it("rejects a mismatched role response", async () => {
    const f = fixture("role");
    f.role.guild.id = otherGuildId;
    await expect(
      addWhitelist(f.store, f.guild, subjectId, actor),
    ).rejects.toMatchObject({ key: "whitelist.lookupFailed" });
    expect(f.memberFetch).not.toHaveBeenCalled();
  });
});
describe("whitelist compatibility and persistence", () => {
  it("handles repeated permanent grants without adding duplicates", async () => {
    const f = fixture();
    const first = await addWhitelist(f.store, f.guild, subjectId, actor);
    const result = await addWhitelist(f.store, f.guild, subjectId, actor);
    expect(result).toMatchObject({
      entry: first.entry,
      duplicate: true,
      upgraded: false,
    });
    expect(listWhitelist(f.store, guildId, actor)).toHaveLength(1);
  });
  it("upgrades a legacy scoped entry in place and preserves unrelated entries", async () => {
    const f = fixture();
    const legacy: WhitelistEntry = {
      id: "legacy-key",
      kind: "user",
      subjectId,
      actions: ["channel.create"],
      expiresAt: Date.now() + 3600000,
    };
    f.store.put(guildId, "whitelist", legacy.id, legacy);
    f.store.put(guildId, "whitelist", "unrelated", {
      ...legacy,
      id: "unrelated",
      subjectId: "423456789012345678",
    });
    await expect(
      addWhitelist(f.store, f.guild, subjectId, actor),
    ).rejects.toMatchObject({ key: "whitelist.upgradeRequired" });
    const result = await addWhitelist(f.store, f.guild, subjectId, actor, {
      confirmUpgrade: true,
    });
    expect(result).toMatchObject({
      entry: { id: "legacy-key", actions: ["*"] },
      upgraded: true,
      duplicate: false,
    });
    expect(result.entry.expiresAt).toBeUndefined();
    expect(listWhitelist(f.store, guildId, actor)).toHaveLength(2);
    expect(
      f.store.get<WhitelistEntry>(guildId, "whitelist", "unrelated")?.actions,
    ).toEqual(["channel.create"]);
  });
  it("upgrades an expired full-access entry instead of reporting active duplicate", async () => {
    const f = fixture();
    f.store.put(guildId, "whitelist", "old", {
      id: "old",
      kind: "user",
      subjectId,
      actions: ["*"],
      expiresAt: 1,
    });
    await expect(
      addWhitelist(f.store, f.guild, subjectId, actor),
    ).rejects.toMatchObject({ key: "whitelist.upgradeRequired" });
    const result = await addWhitelist(f.store, f.guild, subjectId, actor, {
      confirmUpgrade: true,
    });
    expect(result.upgraded).toBe(true);
    expect(result.entry.id).toBe("old");
    expect(result.entry.expiresAt).toBeUndefined();
  });
  it("removes legacy records by subject without requiring current membership", () => {
    const f = fixture();
    for (const kind of ["user", "bot", "role"] as const)
      f.store.put<WhitelistEntry>(guildId, "whitelist", `old:${kind}`, {
        id: `old:${kind}`,
        kind,
        subjectId,
        actions: ["*"],
      });
    f.store.put<WhitelistEntry>(otherGuildId, "whitelist", "private", {
      id: "private",
      kind: "user",
      subjectId,
      actions: ["*"],
    });
    expect(removeWhitelist(f.store, guildId, subjectId, actor)).toEqual({
      removed: 3,
    });
    expect(listWhitelist(f.store, guildId, actor)).toEqual([]);
    expect(listWhitelist(f.store, otherGuildId, actor)).toHaveLength(1);
    expect(f.memberFetch).not.toHaveBeenCalled();
  });
  it("reports an already-removed ID gracefully", () => {
    const f = fixture();
    expect(removeWhitelist(f.store, guildId, subjectId, actor)).toEqual({
      removed: 0,
    });
  });
  it("lists saved advanced permissions without rewriting them", () => {
    const f = fixture();
    const entry = {
      id: "advanced",
      kind: "role" as const,
      subjectId,
      actions: ["role.update"],
      expiresAt: Date.now() + 10000,
    };
    f.store.put(guildId, "whitelist", entry.id, entry);
    expect(listWhitelist(f.store, guildId, actor)).toEqual([entry]);
    expect(listWhitelist(f.store, otherGuildId, actor)).toEqual([]);
  });
  it("persists new grants after restart without resetting settings or old trust", async () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-whitelist-")),
      path = join(dir, "guard.sqlite");
    let store = new SqliteStore(path);
    try {
      const config = store.getConfig(guildId);
      config.mode = "protect";
      store.setConfig(guildId, config);
      const old: WhitelistEntry = {
        id: "old",
        kind: "role",
        subjectId: "423456789012345678",
        actions: ["role.update"],
      };
      store.put(guildId, "whitelist", old.id, old);
      const f = fixture();
      await addWhitelist(store, f.guild, subjectId, actor);
      store.close();
      store = new SqliteStore(path);
      expect(store.getConfig(guildId).mode).toBe("protect");
      expect(store.get<WhitelistEntry>(guildId, "whitelist", old.id)).toEqual(
        old,
      );
      expect(listWhitelist(store, guildId, actor)).toHaveLength(2);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("remains compatible with the existing granular security whitelist engine", async () => {
    const f = fixture();
    const result = await addWhitelist(f.store, f.guild, subjectId, actor);
    expect(
      isWhitelisted(
        [result.entry],
        {
          id: "event",
          guildId,
          action: "role.permissions",
          targetId: "role",
          executorId: subjectId,
          timestamp: Date.now(),
          source: "audit",
        },
        { ownerId: "owner", selfId: "self", roleIds: [], isBot: false },
        Date.now(),
      ),
    ).toBe(true);
    const scoped: WhitelistEntry = {
      id: "scoped",
      kind: "user",
      subjectId,
      actions: ["channel.create"],
    };
    expect(
      isWhitelisted(
        [scoped],
        {
          id: "event",
          guildId,
          action: "role.permissions",
          targetId: "role",
          executorId: subjectId,
          timestamp: Date.now(),
          source: "audit",
        },
        { ownerId: "owner", selfId: "self", roleIds: [], isBot: false },
        Date.now(),
      ),
    ).toBe(false);
  });
});
