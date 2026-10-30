import type { ManagementActor } from "../control/contracts.js";
import { assertManagementActor } from "../control/access.js";
import type { Guild } from "discord.js";
import type { Store, WhitelistEntry } from "../contracts.js";
import { UserError } from "./errors.js";

const MAX_SNOWFLAKE = (1n << 64n) - 1n;

/** IDs are resolved against the current guild; unknown IDs never become trusted. */
export function validateWhitelistSubject(subject: string): string {
  const id = subject.trim();
  if (!/^[1-9]\d{16,21}$/.test(id) || BigInt(id) > MAX_SNOWFLAKE)
    throw new UserError("whitelist.invalidId");
  return id;
}

export interface WhitelistAddResult {
  entry: WhitelistEntry;
  duplicate: boolean;
  upgraded: boolean;
}

export async function addWhitelist(
  store: Store,
  guild: Guild,
  subject: string,
  actor: ManagementActor,
  options: { confirmUpgrade?: boolean } = {},
): Promise<WhitelistAddResult> {
  assertManagementActor(actor);
  const subjectId = validateWhitelistSubject(subject);
  let kind: WhitelistEntry["kind"];
  // Bulk role fetch is authoritative, unlike a possibly stale manager cache.
  let role;
  try {
    const roles = await guild.roles.fetch();
    role = roles.get(subjectId);
  } catch (error) {
    throw new UserError("whitelist.lookupFailed", {}, error);
  }
  if (role) {
    if (role.id !== subjectId || role.guild.id !== guild.id)
      throw new UserError("whitelist.lookupFailed");
    kind = "role";
  } else {
    try {
      const member = await guild.members.fetch({
        user: subjectId,
        force: true,
      });
      if (!member) throw new UserError("whitelist.notFound");
      if (member.id !== subjectId || member.guild.id !== guild.id)
        throw new UserError("whitelist.lookupFailed");
      kind = member.user.bot ? "bot" : "user";
    } catch (error) {
      if (error instanceof UserError) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 10007
      )
        throw new UserError("whitelist.notFound");
      throw new UserError("whitelist.lookupFailed", {}, error);
    }
  }
  assertManagementActor(actor);
  const existing = store
    .list<WhitelistEntry>(guild.id, "whitelist")
    .filter((entry) => entry.subjectId === subjectId && entry.kind === kind);
  const permanent = existing.find(
    (entry) => entry.actions.includes("*") && entry.expiresAt === undefined,
  );
  if (permanent) return { entry: permanent, duplicate: true, upgraded: false };
  const previous = existing[0];
  if (previous && !options.confirmUpgrade)
    throw new UserError("whitelist.upgradeRequired");
  const entry: WhitelistEntry = {
    id: previous?.id ?? `${kind}:${subjectId}`,
    kind,
    subjectId,
    actions: ["*"],
    addedAt: previous?.addedAt ?? Date.now(),
    addedBy: previous?.addedBy ?? actor.userId,
  };
  store.put(guild.id, "whitelist", entry.id, entry);
  return { entry, duplicate: false, upgraded: previous !== undefined };
}

/** Removal uses saved records, so an already-departed member can still be removed. */
export function removeWhitelist(
  store: Store,
  guildId: string,
  subject: string,
  actor: ManagementActor,
): { removed: number } {
  assertManagementActor(actor);
  const subjectId = validateWhitelistSubject(subject);
  const entries = store
    .list<WhitelistEntry>(guildId, "whitelist")
    .filter((entry) => entry.subjectId === subjectId);
  for (const entry of entries) store.delete(guildId, "whitelist", entry.id);
  return { removed: entries.length };
}

export function listWhitelist(
  store: Store,
  guildId: string,
  actor: ManagementActor,
  limit?: number,
  offset?: number,
): WhitelistEntry[] {
  assertManagementActor(actor);
  return store.list<WhitelistEntry>(guildId, "whitelist", limit, offset);
}
