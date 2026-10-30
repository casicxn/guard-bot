import { describe, it, expect } from "vitest";
import {
  catalogs,
  t,
  moduleName,
  moduleDescription,
  languageFor,
  createTranslator,
} from "../../src/locales/index.js";
import { MODULES } from "../../src/security/index.js";
import type { Store } from "../../src/contracts.js";
describe("guild language translation", () => {
  it("provides both names and honest descriptions for every protection", () => {
    for (const module of MODULES)
      for (const lang of ["tr", "en"] as const) {
        expect(catalogs[lang][`module.${module.id}.name`]).toBeTruthy();
        expect(catalogs[lang][`module.${module.id}.description`]).toBeTruthy();
        expect(moduleName(lang, module.id)).not.toContain("module.");
        expect(moduleDescription(lang, module.id)).toBeTruthy();
      }
  });
  it("interpolates values as literal replacements, including dollar characters", () => {
    expect(t("tr", "common.page", { page: 5 })).toBe("Sayfa 5");
    expect(t("en", "error.permission", { permission: "$&" })).toContain("$&");
  });
  it("falls back to English for a missing Turkish key and safely handles an unknown key", () => {
    catalogs.en["test.fallback"] = "English fallback";
    try {
      expect(t("tr", "test.fallback")).toBe("English fallback");
      expect(t("tr", "unknown.internal.key")).toBe(
        t("tr", "error.translationMissing"),
      );
    } finally {
      delete catalogs.en["test.fallback"];
    }
  });
  it("ignores inherited Object properties instead of treating them as translations", () => {
    for (const lang of ["tr", "en"] as const)
      for (const key of ["constructor", "toString", "__proto__"])
        expect(t(lang, key)).toBe(t(lang, "error.translationMissing"));
  });
  it("defaults legacy guilds to Turkish and isolates language per guild", () => {
    const store = {
      getConfig: (id: string) => ({
        language: id === "english" ? "en" : undefined,
      }),
    } as unknown as Store;
    expect(languageFor(store, "old")).toBe("tr");
    expect(createTranslator(store)("english", "common.brand")).toBe(
      "Developed by Casi",
    );
    expect(createTranslator(store)("other", "common.brand")).toBe(
      "Casi tarafından geliştirildi",
    );
  });
  it("has complete common/module dictionaries in both languages", () => {
    for (const [key, value] of Object.entries(catalogs.en)) {
      expect(value).toBeTruthy();
      expect(catalogs.tr[key], key).toBeTruthy();
    }
  });
});
