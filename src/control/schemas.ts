import { z } from "zod";
import type { PresenceConfig, VoiceConfig } from "./contracts.js";
import { UserError } from "../discord/errors.js";
export const snowflake = z
  .string()
  .trim()
  .regex(/^[1-9]\d{16,21}$/)
  .refine((value) => {
    try {
      return BigInt(value) <= (1n << 64n) - 1n;
    } catch {
      return false;
    }
  });
const cleanText = z
  .string()
  .max(128)
  .refine((value) =>
    [...value].every((character) => {
      const point = character.codePointAt(0)!;
      return point >= 32 && point !== 127;
    }),
  );
export const presenceSchema = z
  .object({
    version: z.literal(1).default(1),
    status: z.enum(["online", "idle", "dnd", "invisible"]),
    activityType: z.enum([
      "playing",
      "watching",
      "listening",
      "competing",
      "custom",
      "none",
    ]),
    text: cleanText,
    emoji: z.string().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.activityType !== "none" && !value.text.trim())
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "Activity text is required",
      });
  });
export const defaultPresence: PresenceConfig = {
  version: 1,
  status: "online",
  activityType: "none",
  text: "",
};
export const voiceSchema = z
  .object({
    version: z.literal(1).default(1),
    guildId: snowflake,
    channelId: snowflake.optional(),
    autoJoin: z.boolean(),
    selfMute: z.boolean(),
    selfDeaf: z.boolean(),
    manualDisconnect: z.boolean(),
  })
  .strict();
export const voicePatchSchema = z
  .object({
    channelId: snowflake.optional(),
    autoJoin: z.boolean().optional(),
    selfMute: z.boolean().optional(),
    selfDeaf: z.boolean().optional(),
  })
  .strict();
export function defaultVoice(guildId: string): VoiceConfig {
  return {
    version: 1,
    guildId: snowflake.parse(guildId),
    autoJoin: false,
    selfMute: true,
    selfDeaf: true,
    manualDisconnect: false,
  };
}
export function parsePresence(value: unknown): PresenceConfig {
  try {
    const parsed = presenceSchema.parse(value);
    if (parsed.emoji) throw new UserError("runtime.emojiUnsupported");
    return { ...parsed, emoji: undefined };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError("runtime.presenceInvalid", {}, error);
  }
}
export function parseVoice(value: unknown, guildId: string): VoiceConfig {
  try {
    const parsed = voiceSchema.parse(value);
    if (parsed.guildId !== guildId) throw new Error("Cross guild voice record");
    return parsed;
  } catch (error) {
    throw new UserError("runtime.voiceInvalid", {}, error);
  }
}
