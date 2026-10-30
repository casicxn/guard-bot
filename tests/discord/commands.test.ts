import { describe, it, expect } from "vitest";
import { commandData } from "../../src/discord/commands.js";
import { ApplicationCommandOptionType } from "discord.js";
describe("localized command definitions", () => {
  it("serializes every command and option with Turkish and English metadata", () => {
    const root = commandData.toJSON();
    function check(node: {
      name: string;
      description?: string;
      name_localizations?: unknown;
      description_localizations?: unknown;
      options?: unknown[];
    }) {
      expect(node.name_localizations).toMatchObject({
        tr: expect.any(String),
        "en-US": node.name,
      });
      expect(node.description_localizations).toMatchObject({
        tr: expect.any(String),
        "en-US": node.description,
      });
      for (const child of node.options ?? [])
        check(child as Parameters<typeof check>[0]);
    }
    check(root);
    expect(root.options!.length).toBeLessThanOrEqual(25);
    expect(root.default_member_permissions).toBeNull();
  });
  it("makes whitelist add/remove require only subject and list take no arguments", () => {
    const group = commandData
      .toJSON()
      .options!.find((o) => o.name === "whitelist");
    expect(group?.type).toBe(ApplicationCommandOptionType.SubcommandGroup);
    if (group?.type !== ApplicationCommandOptionType.SubcommandGroup)
      throw new Error("Missing whitelist group");
    expect(group.options?.map((o) => o.name)).toEqual([
      "add",
      "remove",
      "list",
    ]);
    for (const sub of group.options ?? []) {
      expect(sub.options?.map((o) => o.name) ?? []).toEqual(
        sub.name === "list" ? [] : ["subject"],
      );
      if (sub.name !== "list") expect(sub.options?.[0]?.required).toBe(true);
    }
  });
  it("opens guided limits and protection commands without technical arguments", () => {
    for (const name of ["limits", "modules", "help"]) {
      const command = commandData
        .toJSON()
        .options!.find((o) => o.name === name);
      expect(command).toBeDefined();
      if (command?.type !== ApplicationCommandOptionType.Subcommand)
        throw new Error("Expected command");
      expect(command.options ?? []).toEqual([]);
    }
  });
});
