import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { catalogs } from "../../src/locales/index.js";
describe("Discord user-facing translation coverage", () => {
  it("resolves every statically referenced interface and error key in both languages", () => {
    const keys = new Set<string>();
    for (const file of readdirSync(
      join(process.cwd(), "src", "discord"),
    ).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(
        join(process.cwd(), "src", "discord", file),
        "utf8",
      );
      for (const match of source.matchAll(
        /['"]((?:activity|profile|common|panel|persistent|control|runtime|ownership|nuke|response|ops|whitelist|error|mode|status|type|action|permission|severity)\.[A-Za-z][\w.-]*)['"]/g,
      )) {
        if (!match[1]!.endsWith(".")) keys.add(match[1]!);
      }
    }
    expect(keys.size).toBeGreaterThan(50);
    for (const key of keys) {
      expect(catalogs.tr[key], `Missing Turkish ${key}`).toBeTypeOf("string");
      expect(catalogs.en[key], `Missing English ${key}`).toBeTypeOf("string");
    }
  });
});
