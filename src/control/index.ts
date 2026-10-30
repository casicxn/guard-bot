import type { Client } from "discord.js";
import type { Logger } from "pino";
import type { Store } from "../contracts.js";
import type { ManagementControls } from "./contracts.js";
import { AuthorizationService } from "./authorization.js";
import { createPresenceManager } from "./presence.js";
import { createVoiceManager } from "./voice.js";
import { createRestartControl } from "./restart.js";
export function createManagementControls(
  client: Client,
  store: Store,
  logger: Logger,
  ownerId: string,
  options: { isCoreReady?: () => boolean } = {},
): ManagementControls {
  const authorization = new AuthorizationService(ownerId, store, logger);
  return {
    ownerId,
    authorization,
    restart: createRestartControl(
      client,
      store,
      authorization,
      logger,
      options.isCoreReady,
    ),
    presence: createPresenceManager(client, store, authorization, logger),
    voice: createVoiceManager(client, store, authorization, logger),
  };
}
