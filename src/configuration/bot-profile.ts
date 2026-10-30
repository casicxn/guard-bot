import { ActivityType, type PresenceData } from "discord.js";
import { z } from "zod";

export const activityTypes = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
} as const;
export interface BotProfileConfig {
  status: NonNullable<PresenceData["status"]>;
  activityType: keyof typeof activityTypes | "none";
  activityText: string;
  aboutMe: string;
  syncAboutMeOnStartup: boolean;
}

/** Edit this object, rebuild and restart. SQLite and Discord controls cannot override it. */
export const botProfile = Object.freeze({
  status: "online",
  activityType: "custom",
  activityText: "Ultimate Guard",
  aboutMe:
    "Ultimate Guard — Advanced Discord Security System. Developed by Casi.",
  syncAboutMeOnStartup: true,
} satisfies BotProfileConfig);

// Official General Information description is limited to 400 characters:
// https://github.com/discord/discord-api-docs/blob/main/developers/discovery/best-practices.mdx
const profileSchema = z
  .object({
    status: z.enum(["online", "idle", "dnd", "invisible"]),
    activityType: z.enum([
      "playing",
      "watching",
      "listening",
      "competing",
      "custom",
      "none",
    ]),
    activityText: z
      .string()
      .max(128)
      .refine((value) =>
        [...value].every(
          (character) =>
            character.codePointAt(0)! >= 32 &&
            character.codePointAt(0)! !== 127,
        ),
      ),
    aboutMe: z.string().max(400),
    syncAboutMeOnStartup: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.activityType !== "none" && !value.activityText.trim())
      context.addIssue({
        code: "custom",
        path: ["activityText"],
        message: "Activity text is required for the configured activity type.",
      });
  });
export function validateBotProfile(value: unknown): BotProfileConfig {
  return profileSchema.parse(value);
}
