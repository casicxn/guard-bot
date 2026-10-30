import { describe, expect, it, vi } from "vitest";
import { PermissionFlagsBits, type Client } from "discord.js";
import type { Logger } from "pino";
import { SqliteStore } from "../../src/database/index.js";
import { createContainment } from "../../src/discord/containment.js";
import type { SecurityEvent } from "../../src/contracts.js";
const admin = PermissionFlagsBits.Administrator;
function fixture() {
  const store = new SqliteStore(":memory:");
  const config = store.getConfig("guild");
  config.mode = "protect";
  config.zeroTolerance = true;
  store.setConfig("guild", config);
  const roles = new Map([
    [
      "guild",
      {
        id: "guild",
        position: 0,
        managed: false,
        editable: false,
        permissions: { bitfield: 0n },
      },
    ],
    [
      "danger",
      {
        id: "danger",
        position: 2,
        managed: false,
        editable: true,
        permissions: { bitfield: admin },
      },
    ],
    [
      "harmless",
      {
        id: "harmless",
        position: 1,
        managed: false,
        editable: true,
        permissions: { bitfield: 0n },
      },
    ],
  ]);
  const held = new Set(["guild", "danger", "harmless"]);
  let canManage = true,
    override = 0n,
    channelAvailable = true;
  const remove = vi.fn(async (id: string) => {
    held.delete(id);
  });
  const member = () => ({
    id: "attacker",
    user: { bot: false },
    roles: {
      cache: new Map([...roles].filter(([id]) => held.has(id))),
      highest: [...roles.values()]
        .filter((role) => held.has(role.id))
        .sort((a, b) => b.position - a.position)[0]!,
      remove,
    },
    permissions: {
      bitfield: [...roles.values()]
        .filter((role) => held.has(role.id))
        .reduce((bits, role) => bits | role.permissions.bitfield, 0n),
    },
  });
  const fetchMember = vi.fn(async () => member());
  const me = {
    permissions: { has: () => canManage },
    roles: {
      highest: {
        comparePositionTo: (role: { position: number }) => 10 - role.position,
      },
    },
  };
  const guild = {
    id: "guild",
    ownerId: "guild-owner",
    roles: {
      fetch: vi.fn(async (id?: string) =>
        id ? roles.get(id) : new Map(roles),
      ),
    },
    members: { fetch: fetchMember, fetchMe: vi.fn(async () => me) },
    channels: {
      fetch: vi.fn(async () => {
        if (!channelAvailable) throw new Error("Unavailable");
        return new Map([
          [
            "channel",
            {
              permissionOverwrites: { cache: new Map() },
              permissionsFor: () => ({
                bitfield: member().permissions.bitfield | override,
              }),
            },
          ],
        ]);
      }),
    },
  };
  const client = {
    user: { id: "self" },
    guilds: { fetch: vi.fn(async () => guild) },
  } as unknown as Client;
  const logger = { warn: vi.fn() } as unknown as Logger;
  const contain = createContainment(client, store, logger, "instance-owner");
  const event: SecurityEvent = {
    id: "audit",
    guildId: "guild",
    targetId: "channel",
    executorId: "attacker",
    action: "channel.create",
    auditAction: 10,
    source: "audit",
    timestamp: Date.now(),
  };
  return {
    store,
    roles,
    held,
    remove,
    fetchMember,
    guild,
    client,
    contain,
    event,
    setManage: (value: boolean) => {
      canManage = value;
    },
    setOverride: (value: bigint) => {
      override = value;
    },
    setChannelsAvailable: (value: boolean) => {
      channelAvailable = value;
    },
  };
}
describe("fresh and conservative privilege containment", () => {
  it("preserves a harmless role whose channel grant is shadowed by an effective deny", async () => {
    const f = fixture();
    try {
      f.held.delete("danger");
      f.guild.channels.fetch.mockImplementation(
        async () =>
          new Map([
            [
              "channel",
              {
                permissionOverwrites: {
                  cache: new Map([
                    [
                      "harmless",
                      {
                        id: "harmless",
                        type: 0,
                        allow: { bitfield: PermissionFlagsBits.ManageMessages },
                      },
                    ],
                  ]),
                },
                permissionsFor: () => ({ bitfield: 0n }),
              },
            ],
          ]),
      );
      const result = await f.contain(f.event);
      expect(result.status).toBe("contained");
      expect(f.remove).not.toHaveBeenCalled();
      expect(f.held.has("harmless")).toBe(true);
    } finally {
      f.store.close();
    }
  });
  it("refreshes effective channel access after Administrator removal before touching another role", async () => {
    const f = fixture();
    try {
      f.guild.channels.fetch.mockImplementation(
        async () =>
          new Map([
            [
              "channel",
              {
                permissionOverwrites: {
                  cache: new Map([
                    [
                      "harmless",
                      {
                        id: "harmless",
                        type: 0,
                        allow: { bitfield: PermissionFlagsBits.ManageMessages },
                      },
                    ],
                  ]),
                },
                permissionsFor: () => ({
                  bitfield: f.held.has("danger")
                    ? admin | PermissionFlagsBits.ManageMessages
                    : 0n,
                }),
              },
            ],
          ]),
      );
      const result = await f.contain(f.event);
      expect(result).toMatchObject({
        status: "contained",
        removedRoleIds: ["danger"],
      });
      expect(f.remove).toHaveBeenCalledTimes(1);
      expect(f.held.has("harmless")).toBe(true);
    } finally {
      f.store.close();
    }
  });
  it("does not contain a delayed action from before the current Protect activation", async () => {
    const f = fixture();
    try {
      const config = f.store.getConfig("guild");
      config.protectionActivatedAt = f.event.timestamp + 1;
      f.store.setConfig("guild", config);
      expect((await f.contain(f.event)).status).toBe("exempt");
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("removes dangerous roles only and verifies no effective dangerous access remains", async () => {
    const f = fixture();
    try {
      const result = await f.contain(f.event);
      expect(result).toMatchObject({
        status: "contained",
        removedRoleIds: ["danger"],
        remainingRoleIds: [],
        remainingPermissions: "0",
      });
      expect(f.held.has("harmless")).toBe(true);
      expect(f.remove).toHaveBeenCalledWith(
        "danger",
        expect.stringContaining("audit"),
      );
      expect(f.fetchMember.mock.calls.length).toBeGreaterThanOrEqual(3);
    } finally {
      f.store.close();
    }
  });
  it("does not repeat removed roles for concurrent incidents by the same executor", async () => {
    const f = fixture();
    try {
      await Promise.all([
        f.contain(f.event),
        f.contain({ ...f.event, id: "next" }),
      ]);
      expect(f.remove).toHaveBeenCalledTimes(1);
    } finally {
      f.store.close();
    }
  });
  it("persists pending operation before the role API call", async () => {
    const f = fixture();
    try {
      f.remove.mockImplementation(async (id) => {
        expect(
          f.store.get(
            "guild",
            "containment_operations",
            `attacker:audit:${id}`,
          ),
        ).toMatchObject({ state: "pending" });
        f.held.delete(id);
      });
      await f.contain(f.event);
      expect(
        f.store.get("guild", "containment_operations", "attacker:audit:danger"),
      ).toMatchObject({ state: "done" });
    } finally {
      f.store.close();
    }
  });
  it("does not blindly repeat an uncertain API request for the same incident", async () => {
    const f = fixture();
    try {
      f.remove.mockRejectedValueOnce(
        new Error("Connection failed after request"),
      );
      expect((await f.contain(f.event)).status).toBe("failed");
      const result = await f.contain(f.event);
      expect(result.status).toBe("partial");
      expect(f.remove).toHaveBeenCalledTimes(1);
    } finally {
      f.store.close();
    }
  });
  it.each(["guild-owner", "instance-owner", "self"])(
    "exempts %s",
    async (executorId) => {
      const f = fixture();
      try {
        expect((await f.contain({ ...f.event, executorId })).status).toBe(
          "exempt",
        );
        expect(f.remove).not.toHaveBeenCalled();
      } finally {
        f.store.close();
      }
    },
  );
  it("rechecks whitelist after lookup before removing any roles", async () => {
    const f = fixture();
    try {
      f.store.put("guild", "whitelist", "trusted", {
        id: "trusted",
        kind: "role",
        subjectId: "harmless",
        actions: ["channel.create"],
      });
      expect((await f.contain(f.event)).status).toBe("exempt");
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("does not use another module whitelist scope as an exemption", async () => {
    const f = fixture();
    try {
      f.store.put("guild", "whitelist", "trusted", {
        id: "trusted",
        kind: "user",
        subjectId: "attacker",
        actions: ["role.delete"],
      });
      expect((await f.contain(f.event)).status).toBe("contained");
    } finally {
      f.store.close();
    }
  });
  it("reports missing Manage Roles without trying to remove anything", async () => {
    const f = fixture();
    try {
      f.setManage(false);
      expect(await f.contain(f.event)).toMatchObject({
        status: "failed",
        reason: "Missing Manage Roles permission",
        remainingRoleIds: ["danger"],
      });
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("reports hierarchy failure without changing shared roles", async () => {
    const f = fixture();
    try {
      f.roles.get("danger")!.position = 20;
      const result = await f.contain(f.event);
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("hierarchy");
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("reports managed-role danger after removing other manageable roles", async () => {
    const f = fixture();
    try {
      f.roles.set("managed", {
        id: "managed",
        position: 3,
        managed: true,
        editable: false,
        permissions: { bitfield: PermissionFlagsBits.ManageChannels },
      });
      f.held.add("managed");
      const result = await f.contain(f.event);
      expect(result).toMatchObject({
        status: "partial",
        removedRoleIds: ["danger"],
        remainingRoleIds: ["managed"],
      });
      expect(f.held.has("managed")).toBe(true);
    } finally {
      f.store.close();
    }
  });
  it("never claims containment if everyone still grants dangerous permissions", async () => {
    const f = fixture();
    try {
      f.roles.get("guild")!.permissions.bitfield =
        PermissionFlagsBits.ManageMessages;
      const result = await f.contain(f.event);
      expect(result.status).toBe("partial");
      expect(result.remainingRoleIds).toContain("guild");
      expect(f.held.has("guild")).toBe(true);
    } finally {
      f.store.close();
    }
  });
  it("never claims containment if member-specific channel overrides retain danger", async () => {
    const f = fixture();
    try {
      f.setOverride(PermissionFlagsBits.ManageMessages);
      const result = await f.contain(f.event);
      expect(result.status).toBe("partial");
      expect(BigInt(result.remainingPermissions)).toBe(
        PermissionFlagsBits.ManageMessages,
      );
    } finally {
      f.store.close();
    }
  });
  it("reports unknown residual channel access instead of claiming complete containment", async () => {
    const f = fixture();
    try {
      f.setChannelsAvailable(false);
      const result = await f.contain(f.event);
      expect(result).toMatchObject({
        status: "partial",
        remainingPermissions: "unknown",
      });
      expect(result.removedRoleIds).toEqual(["danger"]);
    } finally {
      f.store.close();
    }
  });
  it("stops when global Monitor mode is enabled", async () => {
    const f = fixture();
    try {
      const config = f.store.getConfig("guild");
      config.mode = "monitor";
      f.store.setConfig("guild", config);
      expect((await f.contain(f.event)).status).toBe("exempt");
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it("rechecks a late whitelist edit after the last asynchronous member/role read", async () => {
    const f = fixture();
    try {
      const fetch = f.guild.members.fetchMe;
      let count = 0;
      fetch.mockImplementation(async () => {
        count++;
        if (count === 2)
          f.store.put("guild", "whitelist", "late", {
            id: "late",
            kind: "user",
            subjectId: "attacker",
            actions: ["channel.create"],
          });
        return {
          permissions: { has: () => true },
          roles: {
            highest: {
              comparePositionTo: (role: { position: number }) =>
                10 - role.position,
            },
          },
        };
      });
      expect((await f.contain(f.event)).status).toBe("exempt");
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
  it.each([
    { source: "gateway" as const },
    { executorId: null },
    { auditAction: 12 },
    { timestamp: Date.now() - 61000 },
  ])("rejects non-authoritative attribution %o", async (patch) => {
    const f = fixture();
    try {
      expect((await f.contain({ ...f.event, ...patch })).status).toBe("failed");
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      f.store.close();
    }
  });
});
