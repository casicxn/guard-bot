import { ownerIdSchema } from "../control/identity.js";
import { z } from "zod";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export function persistentPath(path: string): string {
  return path === ":memory:" ? path : resolve(projectRoot, path);
}
const moduleSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["monitor", "protect"]),
  threshold: z.number().int().min(1).max(10000),
  windowMs: z.number().int().min(1000).max(86400000),
  action: z.enum([
    "log",
    "warn",
    "strip",
    "kick",
    "ban",
    "lockdown",
    "reverse",
  ]),
});
export const configSchema = z.object({
  zeroTolerance: z.boolean().default(false),
  protectionActivatedAt: z.number().int().nonnegative().optional(),
  language: z.enum(["tr", "en"]).default("tr"),
  notificationsEnabled: z.boolean().default(true),
  mode: z.enum(["monitor", "protect"]),
  logChannelId: z
    .string()
    .regex(/^\d{17,22}$/)
    .optional(),
  modules: z.record(z.string(), moduleSchema),
  incidentRetentionDays: z.number().int().min(1).max(3650),
  backupRetention: z.number().int().min(1).max(100),
  backupIntervalHours: z.number().int().min(0).max(8760),
  lockdown: z.boolean(),
});
export const whitelistSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["user", "role", "bot"]),
  subjectId: z.string().min(1),
  actions: z.array(z.string().min(1)).min(1).max(100),
  expiresAt: z.number().int().nonnegative().optional(),
  addedAt: z.number().int().nonnegative().optional(),
  addedBy: z.string().optional(),
});
export function readEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return z
    .object({
      DISCORD_TOKEN: z.string().min(20),
      BOT_OWNER_ID: ownerIdSchema,
      DISCORD_CLIENT_ID: z.string().regex(/^\d{17,22}$/),
      DISCORD_GUILD_ID: z
        .string()
        .regex(/^\d{17,22}$/)
        .optional(),
      DATABASE_PATH: z
        .string()
        .min(1)
        .default("./data/guard.sqlite")
        .transform(persistentPath),
      LOG_LEVEL: z
        .enum(["trace", "debug", "info", "warn", "error"])
        .default("info"),
      LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
      LOG_LANGUAGE: z.enum(["tr", "en"]).default("tr"),
      LOG_TO_FILE: z.enum(["true", "false"]).default("false"),
      LOG_DIRECTORY: z
        .string()
        .min(1)
        .default("./logs")
        .transform(persistentPath),
      ENABLE_MEMBERS_INTENT: z.enum(["true", "false"]).default("false"),
      ENABLE_MESSAGE_MONITORING: z.enum(["true", "false"]).default("false"),
      ENABLE_MESSAGE_CONTENT: z.enum(["true", "false"]).default("false"),
    })
    .parse(env);
}
