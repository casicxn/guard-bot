import { t, type Language } from "../locales/index.js";
export type MessageValues = Record<string, string | number>;
export class UserError extends Error {
  constructor(
    public readonly key: string,
    public readonly values: MessageValues = {},
    cause?: unknown,
  ) {
    super(t("en", key, values), { cause });
    this.name = "UserError";
  }
}
export function userErrorText(language: Language, error: unknown): string {
  if (error instanceof UserError) return t(language, error.key, error.values);
  const message = error instanceof Error ? error.message : "";
  if (/permission|missing access/i.test(message))
    return t(language, "ops.result.permissions");
  if (/hierarchy|above bot|higher role/i.test(message))
    return t(language, "ops.result.hierarchy");
  return t(language, "error.generic");
}
