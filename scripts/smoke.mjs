import { createManagementControls } from "../dist/control/index.js";
import assert from "node:assert/strict";
import process from "node:process";
import { Client, GatewayIntentBits } from "discord.js";
import pino from "pino";
import { SqliteStore } from "../dist/database/index.js";
import { SecurityEngine } from "../dist/security/index.js";
import {
  createAdapter,
  installDiscord,
  commandData,
} from "../dist/discord/index.js";
import { createBackupService } from "../dist/recovery/index.js";

// Exercise the production build without credentials, network calls or guild modifications.
const logger = pino({ enabled: false });
const store = new SqliteStore(":memory:");
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildModeration],
});
try {
  const backup = createBackupService(client, store, logger);
  const engine = new SecurityEngine(
    store,
    createAdapter(client, store, logger),
  );
  const controls = createManagementControls(
    client,
    store,
    logger,
    "999999999999999999",
  );
  const dispose = installDiscord(
    client,
    store,
    engine,
    backup,
    logger,
    controls,
  );
  assert.equal(store.getConfig("offline").mode, "monitor");
  assert.equal(commandData.toJSON().name, "guard");
  assert.equal(typeof backup.restore, "function");
  await dispose();
  await Promise.all([controls.presence.dispose(), controls.voice.dispose()]);
  await engine.drain();
  process.stdout.write(
    "Production build offline smoke passed: SQLite, client wiring, command schema, security, recovery and graceful disposal. No Discord login attempted.\n",
  );
} finally {
  await client.destroy();
  store.close();
}
