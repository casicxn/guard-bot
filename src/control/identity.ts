import { z } from "zod";

/** Discord identities are unsigned 64-bit Snowflakes, not names or mentions. */
export const ownerIdSchema = z
  .string({
    error:
      "BOT_OWNER_ID is required. Set it to the Discord user ID of this bot instance's owner.",
  })
  .trim()
  .regex(
    /^[1-9]\d{16,21}$/,
    "BOT_OWNER_ID must be a valid Discord user Snowflake ID (digits only).",
  )
  .refine(
    (value) =>
      /^[1-9]\d{16,21}$/.test(value) && BigInt(value) <= (1n << 64n) - 1n,
    "BOT_OWNER_ID must fit an unsigned 64-bit Discord Snowflake.",
  );
