import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { catalogs, t } from "../../src/locales/index.js";
import { MODULES } from "../../src/security/modules.js";
import { commandData } from "../../src/discord/commands.js";

const languages = ["tr", "en"] as const;
const classifications = [
  "safe",
  "monitored",
  "mitigated",
  "unresolved",
  "failed",
] as const;
const reasons = [
  "botOwner",
  "guildOwner",
  "self",
  "whitelistUser",
  "whitelistRole",
  "trustedBot",
  "policy",
  "monitor",
  "intervention",
  "failed",
  "unresolved",
  "pending",
];
const placeholders = (text: string) =>
  [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)]
    .map((match) => match[1])
    .sort();
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === "locales"
        ? []
        : sourceFiles(join(directory, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(directory, entry.name)]
        : [],
  );
}

describe("complete bilingual interface contract", () => {
  it("has exactly the same nonempty keys and interpolation arguments in both languages", () => {
    expect(Object.keys(catalogs.tr).sort()).toEqual(
      Object.keys(catalogs.en).sort(),
    );
    for (const key of Object.keys(catalogs.en)) {
      for (const language of languages) {
        expect(catalogs[language][key], `${language}:${key}`).toBeTypeOf(
          "string",
        );
        expect(catalogs[language][key]!.trim(), `${language}:${key}`).not.toBe(
          "",
        );
      }
      expect(placeholders(catalogs.tr[key]!), key).toEqual(
        placeholders(catalogs.en[key]!),
      );
    }
  });
  it("covers every activity classification, verified exemption reason and enforcement outcome", () => {
    for (const language of languages) {
      for (const classification of classifications)
        for (const prefix of ["activity.class", "activity.title"])
          expect(
            catalogs[language][`${prefix}.${classification}`],
          ).toBeTruthy();
      for (const reason of reasons)
        expect(catalogs[language][`activity.reason.${reason}`]).toBeTruthy();
      for (const enforcement of [
        "none",
        "applied",
        "failed",
        "uncertain",
        "pending",
      ])
        expect(
          catalogs[language][`activity.enforcement.${enforcement}`],
        ).toBeTruthy();
      for (const field of [
        "action",
        "executor",
        "target",
        "status",
        "reason",
        "enforcement",
        "result",
      ])
        expect(catalogs[language][`activity.field.${field}`]).toBeTruthy();
      expect(
        t(language, "activity.recentEntry", {
          indicator: "🟢",
          status: t(language, "activity.class.safe"),
          action: t(language, "activity.action.channel.create"),
          time: "<t:100:R>",
        }),
      ).not.toMatch(/\{[A-Za-z]/);
    }
    expect(t("tr", "activity.class.safe")).toBe("Güvenli");
    expect(t("en", "activity.class.safe")).toBe("Safe");
    expect(t("tr", "activity.enforcement.none")).toBe("Uygulanmadı");
    expect(t("en", "activity.enforcement.none")).toBe("None");
  });
  it("has a localized past-tense event label for every supported audit and monitoring module", () => {
    for (const module of MODULES)
      for (const language of languages) {
        const label = catalogs[language][`activity.action.${module.id}`];
        expect(label, `${language}:${module.id}`).toBeTruthy();
        expect(label).not.toContain("Protection");
        expect(label).not.toContain("Koruması");
      }
  });
  it("explains source-only profile management while retaining voice management in both help languages", () => {
    for (const language of languages) {
      expect(t(language, "profile.codeOnly")).toContain(
        "src/configuration/bot-profile.ts",
      );
      expect(
        t(language, "profile.readOnlyBody", {
          status: "X",
          type: "Y",
          text: "Z",
          applied: "A",
        }),
      ).not.toMatch(/\{[A-Za-z]/);
      expect(t(language, "control.help")).toContain(
        "src/configuration/bot-profile.ts",
      );
      expect(t(language, "control.help")).toContain(
        language === "tr" ? "Ses" : "Voice",
      );
      expect(t(language, "control.help")).not.toContain(
        language === "tr"
          ? "Etkinlik türünü seçmeden önce"
          : "Set activity text before",
      );
    }
  });
  it("resolves every static user-interface/error key across runtime and Discord source", () => {
    const keys = new Set<string>();
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /['"]((?:activity|profile|common|panel|persistent|control|runtime|ownership|nuke|response|ops|whitelist|error|mode|status|type|action|permission|severity)\.[A-Za-z][\w.-]*)['"]/g,
      ))
        if (!match[1]!.endsWith(".")) keys.add(match[1]!);
    }
    expect(keys.size).toBeGreaterThan(100);
    for (const key of keys)
      for (const language of languages)
        expect(
          catalogs[language][key],
          `Missing ${language}:${key}`,
        ).toBeTypeOf("string");
  });
  it("does not introduce literal user-facing titles, labels, placeholders or reply strings", () => {
    const literal =
      /\.(?:setTitle|setDescription|setLabel|setPlaceholder|reply|followUp|editReply)\(\s*['"]([A-Za-z][^'"]{2,})['"]/g;
    for (const file of sourceFiles(join(process.cwd(), "src", "discord"))) {
      const source = readFileSync(file, "utf8");
      expect(
        [...source.matchAll(literal)].map((match) => match[1]),
        file,
      ).toEqual([]);
    }
  });
  it("localizes command names, descriptions, options and choices through Discord native metadata", () => {
    interface Node {
      name: string;
      description?: string;
      name_localizations?: Record<string, string | null> | null;
      description_localizations?: Record<string, string | null> | null;
      options?: Node[];
      choices?: Node[];
    }
    const check = (node: Node, choice = false) => {
      expect(node.name_localizations?.tr, node.name).toBeTruthy();
      expect(node.name_localizations?.["en-US"], node.name).toBe(node.name);
      if (!choice) {
        expect(node.description_localizations?.tr, node.name).toBeTruthy();
        expect(node.description_localizations?.["en-US"], node.name).toBe(
          node.description,
        );
      }
      for (const option of node.options ?? []) check(option);
      for (const value of node.choices ?? []) check(value, true);
    };
    check(commandData.toJSON() as unknown as Node);
  });
});
