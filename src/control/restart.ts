import type { Client } from "discord.js";
import type { Logger } from "pino";
import type { Store } from "../contracts.js";
import type { OwnerAuthorization } from "./contracts.js";
import { createProtectionControl } from "./protection.js";
import { createRestartProtection } from "../restart/index.js";
import { createDiscordRestartAdapter } from "../restart/adapter.js";
/** Permission grants require an installed, connected, protective and healthy Guard. */
export async function restartGuardReady(
  client: Client,
  store: Store,
  authorization: OwnerAuthorization,
  guildId: string,
  isCoreReady: () => boolean,
): Promise<boolean> {
  if (!isCoreReady() || !client.isReady()) return false;
  try {
    const before = JSON.stringify(store.getConfig(guildId));
    const config = store.getConfig(guildId);
    if (config.mode !== "protect") return false;
    const health = await createProtectionControl(
      client,
      store,
      authorization,
    ).health(guildId);
    if (
      !isCoreReady() ||
      !client.isReady() ||
      JSON.stringify(store.getConfig(guildId)) !== before ||
      !health.auditReady
    )
      return false;
    if (config.zeroTolerance)
      return health.snapshotReady && health.unavailable.length === 0;
    const active = health.modules.filter(
      (module) =>
        config.modules[module.id]?.enabled &&
        config.modules[module.id]?.mode === "protect" &&
        !["log", "warn"].includes(config.modules[module.id]!.action),
    );
    return active.length > 0 && active.every((module) => module.available);
  } catch {
    return false;
  }
}
export function createRestartControl(
  client: Client,
  store: Store,
  authorization: OwnerAuthorization,
  logger: Logger,
  isCoreReady: () => boolean = () => false,
) {
  return createRestartProtection(
    store,
    authorization,
    createDiscordRestartAdapter(client),
    logger,
    {
      guardReady: (guildId) =>
        restartGuardReady(client, store, authorization, guildId, isCoreReady),
    },
  );
}
