import type { Store } from "../contracts.js";
import { en } from "./en.js";
import { tr } from "./tr.js";
export type Language = "tr" | "en";
export type TranslationValues = Record<string, string | number>;
export const catalogs: Record<Language, Record<string, string>> = { tr, en };
export function languageFor(store: Store, guildId: string): Language {
  try {
    return store.getConfig(guildId).language === "en" ? "en" : "tr";
  } catch {
    return "tr";
  }
}
function ownString(
  catalog: Record<string, string>,
  key: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(catalog, key)) return undefined;
  const value = catalog[key];
  return typeof value === "string" ? value : undefined;
}
export function t(
  language: Language,
  key: string,
  values: TranslationValues = {},
): string {
  const selected = language === "en" ? en : tr;
  const template =
    ownString(selected, key) ??
    ownString(en, key) ??
    ownString(tr, key) ??
    ownString(selected, "error.translationMissing") ??
    "This information is temporarily unavailable.";
  return template.replace(
    /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (match: string, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name)
        ? String(values[name])
        : match,
  );
}
export function createTranslator(
  store: Store,
): (guildId: string, key: string, values?: TranslationValues) => string {
  return (guildId, key, values) => t(languageFor(store, guildId), key, values);
}
export function moduleName(language: Language, id: string): string {
  return t(language, `module.${id}.name`);
}
export function moduleDescription(language: Language, id: string): string {
  return t(language, `module.${id}.description`);
}
export function actionName(language: Language, id: string): string {
  return t(language, `action.${id}`);
}
