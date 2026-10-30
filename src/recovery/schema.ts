import { z } from "zod";
const id = z.string().regex(/^\d{1,22}$/);
const permission = z.string().regex(/^\d{1,30}$/);
export const snapshotSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  guildId: id,
  createdAt: z.number().int().nonnegative(),
  guild: z.object({
    name: z.string().min(2).max(100),
    verificationLevel: z.number().int().min(0).max(4),
    explicitContentFilter: z.number().int().min(0).max(2),
    defaultMessageNotifications: z.number().int().min(0).max(1),
  }),
  roles: z
    .array(
      z.object({
        id,
        name: z.string().max(100),
        permissions: permission,
        color: z.number().int(),
        hoist: z.boolean(),
        mentionable: z.boolean(),
        position: z.number().int(),
        managed: z.boolean(),
      }),
    )
    .max(250),
  channels: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(100),
        type: z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(5)]),
        parentId: id.nullable(),
        position: z.number().int(),
        topic: z.string().max(4096).nullable(),
        nsfw: z.boolean(),
        rateLimitPerUser: z.number().int().min(0).max(21600),
        bitrate: z.number().int().nonnegative(),
        userLimit: z.number().int().min(0).max(99),
        overwrites: z
          .array(
            z.object({
              id,
              type: z.union([z.literal(0), z.literal(1)]),
              allow: permission,
              deny: permission,
            }),
          )
          .max(1000),
      }),
    )
    .max(500),
  skippedChannels: z.array(z.string()),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export function parseScope(scope = "all") {
  return z.enum(["roles", "channels", "guild", "all"]).parse(scope);
}
export function validateSnapshot(value: unknown, guildId: string): Snapshot {
  const snapshot = snapshotSchema.parse(value);
  if (snapshot.guildId !== guildId)
    throw new Error("Snapshot belongs to another guild.");
  if (
    new Set(snapshot.roles.map((r) => r.id)).size !== snapshot.roles.length ||
    new Set(snapshot.channels.map((c) => c.id)).size !==
      snapshot.channels.length
  )
    throw new Error("Duplicate snapshot IDs.");
  return snapshot;
}
