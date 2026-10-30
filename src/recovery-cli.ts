import { Client, Events, GatewayIntentBits } from "discord.js";
import { once } from "node:events";
import { readEnvironment } from "./configuration/index.js";
import { SqliteStore } from "./database/index.js";
import { createLogger, closeLogger } from "./logging/index.js";
import { createManagementControls } from "./control/index.js";
import { SecurityEngine } from "./security/index.js";
import { createAdapter, installDiscord } from "./discord/index.js";
import { createBackupService } from "./recovery/index.js";
import { createDiscordRestartAdapter } from "./restart/adapter.js";
import { t } from "./locales/index.js";
import { parseRecoveryArguments } from "./recovery-cli-arguments.js";

// No token or owner override is accepted in argv. Runtime and CLI share a durable process lease.
const env = readEnvironment();
const logger = createLogger(env);
let database: SqliteStore | undefined;
let client: Client | undefined;
let dispose: (() => Promise<void>) | undefined;
let engine: SecurityEngine | undefined;
let controls: ReturnType<typeof createManagementControls> | undefined;
let coreReady = false;
let stopRequested = false;
let finishStop!: () => void;
const stopped = new Promise<void>((resolve) => {
  finishStop = resolve;
});
const requestStop = () => {
  stopRequested = true;
  coreReady = false;
  finishStop();
};
process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);
try {
  const args = parseRecoveryArguments(process.argv.slice(2));
  if (args.help) logger.info(t(env.LOG_LANGUAGE, "cli.usage"));
  else {
    database = new SqliteStore(env.DATABASE_PATH);
    database.acquireProcessLease();
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildScheduledEvents,
      ],
      rest: { timeout: 15000, retries: 2 },
    });
    controls = createManagementControls(
      client,
      database,
      logger,
      env.BOT_OWNER_ID,
      { isCoreReady: () => coreReady },
    );
    engine = new SecurityEngine(
      database,
      createAdapter(client, database, logger, env.BOT_OWNER_ID),
    );
    dispose = installDiscord(
      client,
      database,
      engine,
      createBackupService(client, database, logger),
      logger,
      controls,
      { coordinatedStartup: true },
    );
    coreReady = !stopRequested;
    const ready = once(client, Events.ClientReady, {
      signal: AbortSignal.timeout(30000),
    });
    // Attach rejection observation while login is in flight.
    void ready.catch(() => undefined);
    await client.login(env.DISCORD_TOKEN);
    await ready;
    const session = controls.restart!.get(args.guildId);
    if (
      !session ||
      (args.sessionId && session.id !== args.sessionId) ||
      (args.confirm && session.id !== args.confirm)
    )
      throw new Error(t(env.LOG_LANGUAGE, "cli.noSession"));
    const adapter = createDiscordRestartAdapter(client);
    await adapter.inspect(args.guildId);
    logger.info(
      t(env.LOG_LANGUAGE, "cli.preview", {
        session: session.id,
        state: session.state,
        count: session.roles.length,
      }),
    );
    for (const role of session.roles) {
      const current = await adapter.readRole(args.guildId, role.roleId);
      const matches =
        current?.permissions === role.originalPermissions ||
        current?.permissions === role.lockedPermissions;
      logger.info(
        t(env.LOG_LANGUAGE, "cli.role", {
          role: role.roleId,
          original: role.originalPermissions,
          locked: role.lockedPermissions,
          current: current?.permissions ?? t(env.LOG_LANGUAGE, "cli.missing"),
          review: t(env.LOG_LANGUAGE, matches ? "cli.exact" : "cli.conflict"),
        }),
      );
    }
    if (!args.confirm)
      logger.info(t(env.LOG_LANGUAGE, "cli.confirm", { session: session.id }));
    else {
      const result = await controls.restart!.restore(
        env.BOT_OWNER_ID,
        args.guildId,
        session.id,
      );
      logger.info(
        { category: "RESTORE" },
        t(env.LOG_LANGUAGE, "cli.result", {
          session: result.id,
          state: result.state,
        }),
      );
      if (result.state !== "COMPLETED") process.exitCode = 2;
      logger.info(t(env.LOG_LANGUAGE, "cli.running"));
      await stopped;
    }
  }
} catch (error) {
  logger.error({ err: error }, t(env.LOG_LANGUAGE, "cli.failure"));
  process.exitCode = 1;
} finally {
  process.off("SIGINT", requestStop);
  process.off("SIGTERM", requestStop);
  coreReady = false;
  await dispose?.();
  await controls?.restart?.drain();
  await engine?.drain();
  await Promise.allSettled([
    controls?.voice.dispose(),
    controls?.presence.dispose(),
  ]);
  await client?.destroy();
  database?.close();
  await closeLogger(logger);
}
