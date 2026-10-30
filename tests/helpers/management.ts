import { Events, type Client } from "discord.js";
import type { Logger } from "pino";
import type {
  BackupService,
  SecurityProcessor,
  Store,
} from "../../src/contracts.js";
import type { ManagementControls } from "../../src/control/contracts.js";
import { createManagement } from "../../src/discord/management.js";
import { Sessions } from "../../src/discord/sessions.js";
/** Core action tests isolate message transport; permanent-panel tests exercise the production router. */
export function installPrivateManagement(
  client: Client,
  store: Store,
  _processor: SecurityProcessor,
  backup: BackupService,
  logger: Logger,
  controls: ManagementControls,
): () => Promise<void> {
  const handle = createManagement(
      client,
      store,
      backup,
      logger,
      new Sessions(),
      controls,
    ),
    pending = new Set<Promise<void>>();
  const listener = (interaction: Parameters<typeof handle>[0]) => {
    const task = handle(interaction).catch((error) =>
      logger.error({ err: error }, "Management fixture failed"),
    );
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };
  client.on(Events.InteractionCreate, listener);
  return async () => {
    client.off(Events.InteractionCreate, listener);
    while (pending.size) await Promise.allSettled([...pending]);
  };
}
