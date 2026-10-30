import {
  ActivityType,
  Events,
  type Client,
  type PresenceData,
} from "discord.js";
import type { Logger } from "pino";
import type { Store } from "../contracts.js";
import type {
  OwnerAuthorization,
  PresenceConfig,
  PresenceControl,
  PresenceState,
} from "./contracts.js";
import {
  activityTypes,
  botProfile,
  validateBotProfile,
  type BotProfileConfig,
} from "../configuration/bot-profile.js";
import { UserError } from "../discord/errors.js";

/** Use only the documented bot activity fields. Custom text belongs in state, not a bio endpoint. */
export function presencePayload(config: PresenceConfig): PresenceData {
  return {
    status: config.status,
    activities:
      config.activityType === "none"
        ? []
        : [
            config.activityType === "custom"
              ? {
                  name: "Custom Status",
                  type: ActivityType.Custom,
                  state: config.text,
                }
              : { name: config.text, type: activityTypes[config.activityType] },
          ],
  };
}
export function createPresenceManager(
  client: Client,
  _store: Store,
  authorization: OwnerAuthorization,
  logger: Logger,
  configuration: BotProfileConfig = botProfile,
): PresenceControl {
  let disposed = false,
    started = false,
    descriptionChecked = false,
    queue: Promise<unknown> = Promise.resolve(),
    lastApplied: PresenceConfig | undefined;
  const getConfig = (): PresenceConfig => {
    const profile = validateBotProfile(configuration);
    return {
      version: 1,
      status: profile.status,
      activityType: profile.activityType,
      text: profile.activityText,
    };
  };
  const schedule = <T>(task: () => Promise<T> | T): Promise<T> => {
    const next = queue.catch(() => undefined).then(task);
    queue = next;
    return next;
  };
  async function initialize(): Promise<void> {
    if (disposed || !client.isReady() || !client.user) return;
    let profile: BotProfileConfig;
    try {
      profile = validateBotProfile(configuration);
    } catch (error) {
      logger.warn(
        { err: error },
        "Invalid source bot profile; security remains operational. Edit src/configuration/bot-profile.ts and restart.",
      );
      return;
    }
    try {
      const config = getConfig();
      client.user.setPresence(presencePayload(config));
      lastApplied = config;
    } catch (error) {
      logger.warn(
        { err: error },
        "Source presence initialization failed; security remains operational",
      );
    }
    if (descriptionChecked || disposed) return;
    descriptionChecked = true;
    if (!profile.syncAboutMeOnStartup) {
      logger.info?.(
        "Application description synchronization disabled; manage it in Discord Developer Portal → General Information → Description.",
      );
      return;
    }
    try {
      if (!client.application)
        throw new Error("Client application information is unavailable.");
      const application = await client.application.fetch();
      if (disposed) return;
      if ((application.description ?? "") === profile.aboutMe) {
        logger.info?.("Application description unchanged; no update required.");
        return;
      }
      await application.edit({ description: profile.aboutMe });
      logger.info?.(
        "Application description synchronized from source configuration; Discord clients may require refresh.",
      );
    } catch (error) {
      logger.warn(
        { err: error },
        "Application description synchronization failed; no successful update is claimed. Manual fallback: Discord Developer Portal → General Information → Description.",
      );
    }
  }
  const ready = () => {
    void schedule(initialize).catch((error) =>
      logger.warn(
        { err: error },
        "Source profile readiness handler failed; security remains operational",
      ),
    );
  };
  return {
    getConfig,
    getState(): PresenceState {
      const ready = client.isReady() && !disposed,
        activity = client.user?.presence?.activities?.[0];
      const activityType = activity
        ? (Object.entries(activityTypes).find(
            ([, type]) => type === activity.type,
          )?.[0] as Exclude<PresenceConfig["activityType"], "none"> | undefined)
        : undefined;
      return {
        ready,
        status: ready
          ? (client.user?.presence?.status ?? lastApplied?.status ?? "offline")
          : "offline",
        activityType: activityType ?? "none",
        text: activity
          ? activity.type === ActivityType.Custom
            ? (activity.state ?? "")
            : activity.name
          : "",
        applied: ready && lastApplied !== undefined,
      };
    },
    async update(actorId) {
      authorization.assertOwner(actorId);
      throw new UserError("profile.codeOnly");
    },
    async reset(actorId) {
      authorization.assertOwner(actorId);
      throw new UserError("profile.codeOnly");
    },
    async start() {
      if (disposed || started) return;
      started = true;
      client.on(Events.ClientReady, ready);
      if (client.isReady()) await schedule(initialize);
    },
    async dispose() {
      disposed = true;
      client.off(Events.ClientReady, ready);
      await queue.catch(() => undefined);
    },
  };
}
