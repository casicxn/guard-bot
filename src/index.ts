import { createManagementControls } from "./control/index.js";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { createLogger, closeLogger } from "./logging/index.js";
import { createStartupCoordinator } from "./startup/index.js";
import { readEnvironment } from "./configuration/index.js";
import { SqliteStore } from "./database/index.js";
import { SecurityEngine } from "./security/index.js";
import { createAdapter, installDiscord } from "./discord/index.js";
import { createBackupService } from "./recovery/index.js";

const env = (() => {
  try {
    return readEnvironment();
  } catch {
    const fallback = createLogger({
      LOG_LEVEL: "error",
      LOG_FORMAT: "pretty",
      LOG_LANGUAGE: "tr",
    });
    fallback.error(
      "Configuration validation failed; check required credentials and log settings",
    );
    process.exit(1);
  }
})();
const logger = createLogger(env);
const store = await (async () => {
  try {
    const database = new SqliteStore(env.DATABASE_PATH);
    try {
      database.acquireProcessLease();
    } catch (error) {
      database.close();
      throw error;
    }
    return database;
  } catch (error) {
    logger.error(
      { err: error, category: "CRITICAL" },
      "Database restoration failed; startup stopped",
    );
    await closeLogger(logger);
    process.exit(1);
  }
})();
logger.info({ category: "DATABASE" }, "SQLite connected");
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildWebhooks,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildEmojisAndStickers,
  GatewayIntentBits.GuildScheduledEvents,
];
if (env.ENABLE_MEMBERS_INTENT === "true")
  intents.push(GatewayIntentBits.GuildMembers);
if (
  env.ENABLE_MESSAGE_MONITORING === "true" ||
  env.ENABLE_MESSAGE_CONTENT === "true"
)
  intents.push(GatewayIntentBits.GuildMessages);
if (env.ENABLE_MESSAGE_CONTENT === "true")
  intents.push(GatewayIntentBits.MessageContent);
const client = new Client({ intents, rest: { timeout: 15000, retries: 2 } });
const backups = createBackupService(client, store, logger);
const engine = new SecurityEngine(
  store,
  createAdapter(client, store, logger, env.BOT_OWNER_ID),
);
let coreInstalled = false;
const controls = createManagementControls(
  client,
  store,
  logger,
  env.BOT_OWNER_ID,
  { isCoreReady: () => coreInstalled && !stopping },
);
const disposeDiscord = installDiscord(
  client,
  store,
  engine,
  backups,
  logger,
  controls,
  { coordinatedStartup: true },
);
let stopping = false;
coreInstalled = true;
const startup = createStartupCoordinator(client, store, controls, logger, {
  restorePanels: disposeDiscord.restorePanels,
  refreshPanels: disposeDiscord.refreshPanels,
  coreReady: () => !stopping,
});
let maintenanceTask: Promise<void> | undefined;
let shutdownTask: Promise<void> | undefined;

client.on(Events.Error, (error) =>
  logger.error({ err: error }, "Discord client error"),
);
client.on(Events.Warn, (message) =>
  logger.warn({ message }, "Discord warning"),
);
client.once(Events.ClientReady, () => {
  void startup
    .start()
    .catch((error) =>
      logger.error(
        { err: error, category: "CRITICAL" },
        "Startup restoration failed",
      ),
    );
});
client.on(Events.ShardDisconnect, (_event, shardId) =>
  logger.warn(
    { shardId },
    "Gateway disconnected; protection coverage degraded until reconnect",
  ),
);
client.on(Events.ShardResume, (shardId, replayedEvents) =>
  logger.info({ shardId, replayedEvents }, "Gateway resumed"),
);

const maintenance = setInterval(() => {
  if (stopping || maintenanceTask) return;
  maintenanceTask = (async () => {
    for (const guild of client.guilds.cache.values()) {
      if (stopping) break;
      try {
        store.cleanup(guild.id);
        const config = store.getConfig(guild.id);
        if (config.backupIntervalHours > 0) {
          const newest = backups.list(guild.id)[0];
          if (
            !newest ||
            Date.now() - newest.createdAt >=
              config.backupIntervalHours * 3600000
          )
            await backups.create(guild.id);
        }
      } catch (error) {
        logger.error({ err: error, guildId: guild.id }, "Maintenance failed");
      }
    }
  })()
    .catch((error) =>
      logger.error({ err: error }, "Maintenance dependency failure"),
    )
    .finally(() => {
      maintenanceTask = undefined;
    });
}, 60000);
maintenance.unref();

function shutdown(): Promise<void> {
  if (shutdownTask) return shutdownTask;
  stopping = true;
  coreInstalled = false;
  clearInterval(maintenance);
  shutdownTask = (async () => {
    // Stop accepting gateway work, drain handlers/effects, then close the durable store.
    const drained = disposeDiscord();
    await startup.dispose();
    await Promise.allSettled([
      controls.voice.dispose(),
      controls.presence.dispose(),
    ]);
    await client.destroy();
    await drained;
    await maintenanceTask;
    await engine.drain();
    await controls.restart?.drain();
    store.close();
    logger.info("Shutdown complete");
    await closeLogger(logger);
  })();
  return shutdownTask;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void shutdown().catch((error) => {
      logger.error({ err: error }, "Shutdown failed");
      process.exitCode = 1;
    });
  });
try {
  await client.login(env.DISCORD_TOKEN);
} catch (error) {
  logger.error(
    { error: error instanceof Error ? error.message : "Unknown login failure" },
    "Startup failed",
  );
  await shutdown();
  process.exitCode = 1;
}
