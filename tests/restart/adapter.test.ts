import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits, type Client } from "discord.js";
import { createDiscordRestartAdapter } from "../../src/restart/adapter.js";
function fixture() {
  const role = {
    id: "role",
    name: "Mod",
    position: 4,
    managed: false,
    editable: true,
    tags: null as { botId: string } | null,
    permissions: {
      bitfield:
        PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ViewChannel,
    },
    setPermissions: vi.fn(async () => undefined),
  };
  const me = {
    permissions: {
      has: vi.fn(() => true),
      bitfield: PermissionFlagsBits.Administrator,
    },
    roles: { highest: { position: 10 }, cache: new Map([["bot-role", {}]]) },
  };
  const guild = {
    id: "guild",
    ownerId: "owner",
    roles: {
      fetch: vi.fn(async (id?: string) =>
        id ? role : new Map([[role.id, role]]),
      ),
    },
    members: {
      fetchMe: vi.fn(async () => me),
      fetch: vi.fn(async () => ({ roles: { cache: new Map([["role", {}]]) } })),
    },
    channels: {
      fetch: vi.fn(
        async () =>
          new Map([
            [
              "channel",
              {
                id: "channel",
                permissionOverwrites: {
                  cache: new Map([
                    [
                      "member",
                      {
                        id: "member",
                        allow: { bitfield: PermissionFlagsBits.ManageMessages },
                      },
                    ],
                  ]),
                },
              },
            ],
          ]),
      ),
    },
  };
  const client = {
    isReady: () => true,
    user: { id: "bot" },
    guilds: { fetch: vi.fn(async () => guild) },
  } as unknown as Client;
  return {
    role,
    me,
    guild,
    client,
    adapter: createDiscordRestartAdapter(client),
  };
}
describe("Discord restart permission adapter", () => {
  it("refuses granting a permission the bot does not currently possess", async () => {
    const f = fixture();
    f.me.permissions.has.mockImplementation(
      (...args: unknown[]) => args[0] !== PermissionFlagsBits.Administrator,
    );
    await expect(
      f.adapter.setPermissions(
        "guild",
        "role",
        (
          f.role.permissions.bitfield | PermissionFlagsBits.Administrator
        ).toString(),
        "restore",
        f.role.permissions.bitfield.toString(),
      ),
    ).rejects.toThrow("cannot grant");
    expect(f.role.setPermissions).not.toHaveBeenCalled();
  });
  it("inspects fresh authoritative roles, bot hierarchy and overwrite risks without fetching all members", async () => {
    const f = fixture();
    const result = await f.adapter.inspect("guild");
    expect(result).toMatchObject({
      id: "guild",
      manageRoles: true,
      botHighestPosition: 10,
      overwriteRisks: ["overwrite:channel:member"],
    });
    expect(result.roles[0]?.permissions).toBe(
      (
        PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ViewChannel
      ).toString(),
    );
    expect(f.guild.roles.fetch).toHaveBeenCalledWith();
    expect(f.guild.members.fetchMe).toHaveBeenCalledWith({ force: true });
    expect(f.guild.members.fetch).not.toHaveBeenCalled();
  });
  it("refuses exact-previous-value conflicts immediately before a role write", async () => {
    const f = fixture();
    await expect(
      f.adapter.setPermissions("guild", "role", "1024", "test", "0"),
    ).rejects.toThrow("changed");
    expect(f.role.setPermissions).not.toHaveBeenCalled();
  });
  it("uses supported exact bitfields only after fresh hierarchy checks", async () => {
    const f = fixture();
    const previous = f.role.permissions.bitfield.toString();
    await f.adapter.setPermissions(
      "guild",
      "role",
      PermissionFlagsBits.ViewChannel.toString(),
      "test",
      previous,
    );
    expect(f.role.setPermissions).toHaveBeenCalledWith(
      PermissionFlagsBits.ViewChannel,
      "test",
    );
  });
  it.each(["managed", "hierarchy", "permission"])(
    "rejects a fresh %s failure without writing",
    async (kind) => {
      const f = fixture();
      if (kind === "managed") f.role.managed = true;
      if (kind === "hierarchy") f.role.position = 15;
      if (kind === "permission") f.me.permissions.has.mockReturnValue(false);
      await expect(
        f.adapter.setPermissions("guild", "role", "1024", "test"),
      ).rejects.toThrow();
      expect(f.role.setPermissions).not.toHaveBeenCalled();
    },
  );
  it("checks only known contained members and never guesses an incomplete cache safe", async () => {
    const f = fixture();
    expect(
      await f.adapter.roleContainsContained("guild", "role", ["attacker"]),
    ).toBe(true);
    expect(f.guild.members.fetch).toHaveBeenCalledWith({
      user: "attacker",
      force: true,
    });
    f.guild.members.fetch.mockRejectedValueOnce(new Error("Missing access"));
    await expect(
      f.adapter.roleContainsContained("guild", "role", ["attacker"]),
    ).rejects.toThrow("Missing access");
  });
});
