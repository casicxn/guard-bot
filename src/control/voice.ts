import {
  ChannelType,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Client,
  type ClientEvents,
  type Guild,
  type VoiceBasedChannel,
} from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Logger } from "pino";
import type { Store } from "../contracts.js";
import { publishChange } from "../change-events.js";
import type {
  OwnerAuthorization,
  VoiceConfig,
  VoiceControl,
  VoiceState,
} from "./contracts.js";
import { defaultVoice, parseVoice, voicePatchSchema } from "./schemas.js";
import { UserError } from "../discord/errors.js";
const GROUP = "ultimate-guard";
export interface VoiceBackend {
  join(options: Parameters<typeof joinVoiceChannel>[0]): VoiceConnection;
  get(guildId: string, group?: string): VoiceConnection | undefined;
  ready(
    connection: VoiceConnection,
    timeoutMs: number,
  ): Promise<VoiceConnection>;
}
const nativeBackend: VoiceBackend = {
  join: joinVoiceChannel,
  get: getVoiceConnection,
  ready: (connection, timeoutMs) =>
    entersState(connection, VoiceConnectionStatus.Ready, timeoutMs),
};
class TerminalVoiceError extends UserError {}
const errorCode = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? error.code
    : undefined;
export function createVoiceManager(
  client: Client,
  store: Store,
  authorization: OwnerAuthorization,
  logger: Logger,
  backend: VoiceBackend = nativeBackend,
): VoiceControl {
  const queues = new Map<string, Promise<unknown>>(),
    states = new Map<string, VoiceState>(),
    managed = new Map<string, VoiceConnection>(),
    wanted = new Set<string>(),
    generations = new Map<string, number>(),
    timers = new Map<string, ReturnType<typeof setTimeout>>(),
    attempts = new Map<string, number>();
  const removers: (() => void)[] = [];
  const attached = new WeakSet<VoiceConnection>();
  const reportedFailures = new WeakSet<object>();
  function reported(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === "object" &&
      reportedFailures.delete(error)
    );
  }
  let disposed = false,
    started = false;
  const getConfig = (guildId: string) =>
    parseVoice(
      store.get(guildId, "runtime", "voice") ?? defaultVoice(guildId),
      guildId,
    );
  const generation = (guildId: string) => generations.get(guildId) ?? 0;
  const bump = (guildId: string) => {
    generations.set(guildId, generation(guildId) + 1);
  };
  const cancel = (guildId: string) => {
    const timer = timers.get(guildId);
    if (timer) clearTimeout(timer);
    timers.delete(guildId);
  };
  const current = (guildId: string) =>
    backend.get(guildId, GROUP) ?? managed.get(guildId);
  const state = (guildId: string, value: VoiceState) => {
    const previous = states.get(guildId);
    states.set(guildId, value);
    if (JSON.stringify(previous) !== JSON.stringify(value))
      publishChange(store, guildId, "voice_state");
  };
  function run<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    const next = (queues.get(guildId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    queues.set(guildId, next);
    void next
      .finally(() => {
        if (queues.get(guildId) === next) queues.delete(guildId);
      })
      .catch(() => undefined);
    return next;
  }
  function safe(task: Promise<unknown>, guildId?: string) {
    void task.catch((error) => {
      if (!reported(error))
        logger.warn(
          { err: error, guildId },
          "Voice operation failed; security remains operational",
        );
    });
  }
  function destroy(guildId: string) {
    const connection = current(guildId);
    if (
      connection &&
      connection.state.status !== VoiceConnectionStatus.Destroyed
    )
      connection.destroy();
    managed.delete(guildId);
  }
  function block(guildId: string, reason: string) {
    cancel(guildId);
    wanted.delete(guildId);
    state(guildId, {
      status: "blocked",
      retryCount: attempts.get(guildId) ?? 0,
      reason,
    });
  }
  function canRecover(guildId: string): boolean {
    if (disposed || !wanted.has(guildId)) return false;
    try {
      return !getConfig(guildId).manualDisconnect;
    } catch (error) {
      logger.warn({ err: error, guildId }, "Voice configuration unavailable");
      block(guildId, "runtime.voiceInvalid");
      return false;
    }
  }
  function retry(guildId: string): void {
    try {
      if (!canRecover(guildId) || timers.has(guildId)) return;
      const count = attempts.get(guildId) ?? 0;
      if (count >= 5) {
        block(guildId, "runtime.voiceRetriesExhausted");
        destroy(guildId);
        return;
      }
      const token = generation(guildId),
        delay = Math.min(30000, 1000 * 2 ** count);
      attempts.set(guildId, count + 1);
      state(guildId, {
        status: "retrying",
        channelId: getConfig(guildId).channelId,
        retryCount: count + 1,
        reason: "runtime.voiceTemporary",
      });
      const timer = setTimeout(() => {
        timers.delete(guildId);
        if (disposed || generation(guildId) !== token || !canRecover(guildId))
          return;
        safe(
          run(guildId, () => attempt(guildId, token)),
          guildId,
        );
      }, delay);
      timer.unref?.();
      timers.set(guildId, timer);
    } catch (error) {
      logger.warn({ err: error, guildId }, "Voice retry scheduling failed");
      block(guildId, "runtime.voiceInvalid");
    }
  }
  async function resolve(
    config: VoiceConfig,
  ): Promise<{ guild: Guild; channel: VoiceBasedChannel }> {
    if (!client.isReady()) throw new UserError("runtime.notReady");
    if (!client.options.intents.has(GatewayIntentBits.GuildVoiceStates))
      throw new TerminalVoiceError("runtime.voiceIntent");
    if (!config.channelId)
      throw new TerminalVoiceError("runtime.voiceNoChannel");
    let guild: Guild;
    let channel;
    try {
      guild = await client.guilds.fetch({ guild: config.guildId, force: true });
      channel = await guild.channels.fetch(config.channelId, { force: true });
    } catch (error) {
      if ([10003, 10004, 50001, 50013].includes(Number(errorCode(error))))
        throw new TerminalVoiceError(
          Number(errorCode(error)) === 10003
            ? "runtime.voiceChannelMissing"
            : "runtime.voicePermissions",
          {},
          error,
        );
      throw error;
    }
    if (!channel) throw new TerminalVoiceError("runtime.voiceChannelMissing");
    if (channel.guildId !== config.guildId || guild.id !== config.guildId)
      throw new TerminalVoiceError("runtime.voiceWrongGuild");
    if (channel.type !== ChannelType.GuildVoice)
      throw new TerminalVoiceError("runtime.voiceChannelType");
    const me = await guild.members.fetchMe({ force: true });
    const permissions = channel.permissionsFor(me);
    if (
      !permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
      ])
    )
      throw new TerminalVoiceError("runtime.voicePermissions");
    return { guild, channel };
  }
  function attach(guildId: string, connection: VoiceConnection): void {
    managed.set(guildId, connection);
    if (attached.has(connection)) return;
    attached.add(connection);
    const changed = (
      _old: unknown,
      next: { status: VoiceConnectionStatus },
    ) => {
      if (disposed || managed.get(guildId) !== connection) return;
      if (next.status === VoiceConnectionStatus.Ready) {
        cancel(guildId);
        attempts.set(guildId, 0);
        state(guildId, {
          status: "ready",
          channelId: connection.joinConfig.channelId ?? undefined,
          retryCount: 0,
        });
      } else if (
        next.status === VoiceConnectionStatus.Disconnected ||
        next.status === VoiceConnectionStatus.Destroyed
      )
        retry(guildId);
    };
    const failed = (error: Error) => {
      logger.warn({ err: error, guildId }, "Voice connection error");
      retry(guildId);
    };
    connection.on("stateChange", changed);
    connection.on("error", failed);
    removers.push(() => {
      connection.off("stateChange", changed);
      connection.off("error", failed);
    });
  }
  async function attempt(guildId: string, token: number): Promise<void> {
    if (disposed || generation(guildId) !== token || !canRecover(guildId))
      return;
    const config = getConfig(guildId);
    state(guildId, {
      status: "connecting",
      channelId: config.channelId,
      retryCount: attempts.get(guildId) ?? 0,
    });
    try {
      const { guild } = await resolve(config);
      if (disposed || generation(guildId) !== token || !canRecover(guildId))
        return;
      let connection = current(guildId);
      if (
        connection &&
        connection.state.status !== VoiceConnectionStatus.Destroyed
      ) {
        attach(guildId, connection);
        if (
          connection.state.status !== VoiceConnectionStatus.Ready ||
          connection.joinConfig.channelId !== config.channelId ||
          connection.joinConfig.selfMute !== config.selfMute ||
          connection.joinConfig.selfDeaf !== config.selfDeaf
        )
          connection.rejoin({
            channelId: config.channelId!,
            selfMute: config.selfMute,
            selfDeaf: config.selfDeaf,
          });
      } else {
        connection = backend.join({
          guildId,
          channelId: config.channelId!,
          adapterCreator: guild.voiceAdapterCreator,
          selfMute: config.selfMute,
          selfDeaf: config.selfDeaf,
          group: GROUP,
        });
        attach(guildId, connection);
      }
      try {
        await backend.ready(connection, 15000);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError")
          throw new UserError("runtime.voiceTimeout", {}, error);
        throw error;
      }
      if (disposed || generation(guildId) !== token || !canRecover(guildId))
        return;
      cancel(guildId);
      attempts.set(guildId, 0);
      state(guildId, {
        status: "ready",
        channelId: connection.joinConfig.channelId ?? config.channelId,
        retryCount: 0,
      });
    } catch (error) {
      if (disposed) return;
      if (generation(guildId) !== token)
        throw new UserError("runtime.voiceInterrupted", {}, error);
      logger.warn(
        { err: error, guildId },
        error instanceof UserError && error.key === "runtime.voiceTimeout"
          ? "Voice connection timed out after 15 seconds; security remains operational"
          : "Voice connection attempt failed",
      );
      if (error !== null && typeof error === "object")
        reportedFailures.add(error);
      const permanent =
        error instanceof TerminalVoiceError
          ? error.key
          : [10003, 10004, 50001, 50013].includes(Number(errorCode(error)))
            ? Number(errorCode(error)) === 10003
              ? "runtime.voiceChannelMissing"
              : "runtime.voicePermissions"
            : undefined;
      if (permanent) {
        block(guildId, permanent);
        destroy(guildId);
      } else retry(guildId);
      throw error;
    }
  }
  function on<E extends keyof ClientEvents>(
    event: E,
    handler: (...args: ClientEvents[E]) => void,
  ) {
    const guarded = (...args: ClientEvents[E]) => {
      try {
        handler(...args);
      } catch (error) {
        logger.warn(
          { err: error, event },
          "Voice event handler failed; security remains operational",
        );
      }
    };
    client.on(event, guarded);
    removers.push(() => client.off(event, guarded));
  }
  async function auto(guildId: string): Promise<void> {
    if (disposed) return;
    try {
      const config = getConfig(guildId);
      if (!config.autoJoin || config.manualDisconnect) return;
      const existing = states.get(guildId);
      if (existing?.status === "blocked") return;
      wanted.add(guildId);
      await run(guildId, () => attempt(guildId, generation(guildId)));
    } catch (error) {
      if (!reported(error))
        logger.warn({ err: error, guildId }, "Voice auto-join unavailable");
    }
  }
  return {
    getConfig,
    getState(guildId) {
      const connection = current(guildId);
      if (connection?.state.status === VoiceConnectionStatus.Ready)
        return {
          status: "ready",
          channelId: connection.joinConfig.channelId ?? undefined,
          retryCount: 0,
        };
      if (
        connection &&
        ![
          VoiceConnectionStatus.Destroyed,
          VoiceConnectionStatus.Disconnected,
        ].includes(connection.state.status)
      )
        return {
          ...(states.get(guildId) ?? { retryCount: 0 }),
          status:
            states.get(guildId)?.status === "retrying"
              ? "retrying"
              : "connecting",
          channelId: connection.joinConfig.channelId ?? undefined,
        };
      return {
        ...(states.get(guildId) ?? { status: "disconnected", retryCount: 0 }),
      };
    },
    async configure(actorId, guildId, patch) {
      authorization.assertOwner(actorId);
      let values;
      try {
        values = voicePatchSchema.parse(patch);
      } catch (error) {
        throw new UserError("runtime.voiceInvalid", {}, error);
      }
      return run(guildId, async () => {
        authorization.assertOwner(actorId);
        const token = generation(guildId),
          old = getConfig(guildId),
          next = parseVoice(
            {
              ...old,
              ...values,
              manualDisconnect:
                values.autoJoin === true ? false : old.manualDisconnect,
            },
            guildId,
          );
        if (values.channelId !== undefined || next.autoJoin)
          await resolve(next);
        if (disposed || generation(guildId) !== token)
          throw new UserError("runtime.voiceInterrupted");
        authorization.assertOwner(actorId);
        store.put(guildId, "runtime", "voice", next);
        if (values.autoJoin === false) {
          wanted.delete(guildId);
          cancel(guildId);
        } else if (next.autoJoin && !next.manualDisconnect) {
          wanted.add(guildId);
          attempts.set(guildId, 0);
          await attempt(guildId, token);
        } else if (
          current(guildId)?.state.status === VoiceConnectionStatus.Ready &&
          (values.selfMute !== undefined || values.selfDeaf !== undefined)
        ) {
          wanted.add(guildId);
          await attempt(guildId, token);
        }
        return next;
      });
    },
    async connect(actorId, guildId) {
      authorization.assertOwner(actorId);
      await run(guildId, async () => {
        authorization.assertOwner(actorId);
        const config = getConfig(guildId);
        if (!config.channelId) throw new UserError("runtime.voiceNoChannel");
        store.put(guildId, "runtime", "voice", {
          ...config,
          manualDisconnect: false,
        });
        wanted.add(guildId);
        cancel(guildId);
        attempts.set(guildId, 0);
        await attempt(guildId, generation(guildId));
      });
    },
    async disconnect(actorId, guildId) {
      authorization.assertOwner(actorId);
      const config = getConfig(guildId);
      store.put(guildId, "runtime", "voice", {
        ...config,
        manualDisconnect: true,
      });
      bump(guildId);
      wanted.delete(guildId);
      cancel(guildId);
      destroy(guildId);
      state(guildId, {
        status: "disconnected",
        retryCount: 0,
        reason: "runtime.voiceManual",
      });
    },
    async reconnect(actorId, guildId) {
      authorization.assertOwner(actorId);
      bump(guildId);
      cancel(guildId);
      wanted.delete(guildId);
      destroy(guildId);
      await run(guildId, async () => {
        authorization.assertOwner(actorId);
        const config = getConfig(guildId);
        if (!config.channelId) throw new UserError("runtime.voiceNoChannel");
        store.put(guildId, "runtime", "voice", {
          ...config,
          manualDisconnect: false,
        });
        wanted.add(guildId);
        attempts.set(guildId, 0);
        await attempt(guildId, generation(guildId));
      });
    },
    async start() {
      if (disposed) return;
      if (!started) {
        started = true;
        on(Events.ClientReady, () => {
          for (const guild of client.guilds.cache.values())
            safe(auto(guild.id), guild.id);
        });
        on(Events.GuildAvailable, (guild) => safe(auto(guild.id), guild.id));
        on(Events.ShardResume, () => {
          for (const guild of client.guilds.cache.values())
            if (canRecover(guild.id)) retry(guild.id);
        });
        on(Events.VoiceStateUpdate, (_old, next) => {
          if (next.id !== client.user?.id || !canRecover(next.guild.id)) return;
          const config = getConfig(next.guild.id);
          if (next.channelId !== config.channelId) retry(next.guild.id);
        });
        on(Events.ChannelDelete, (channel) => {
          if (!("guild" in channel)) return;
          try {
            if (getConfig(channel.guild.id).channelId === channel.id) {
              bump(channel.guild.id);
              block(channel.guild.id, "runtime.voiceChannelMissing");
              destroy(channel.guild.id);
            }
          } catch (error) {
            logger.warn(
              { err: error, guildId: channel.guild.id },
              "Deleted voice channel handling failed",
            );
          }
        });
        on(Events.GuildDelete, (guild) => {
          bump(guild.id);
          block(guild.id, "runtime.voiceGuildUnavailable");
          destroy(guild.id);
        });
      }
      if (client.isReady())
        for (const guild of client.guilds.cache.values()) await auto(guild.id);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      wanted.clear();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const remove of removers) remove();
      for (const guildId of managed.keys()) {
        bump(guildId);
        destroy(guildId);
      }
      await Promise.allSettled([...queues.values()]);
      managed.clear();
    },
  };
}
