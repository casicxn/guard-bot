import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import {
  ChannelType,
  Events,
  GatewayIntentBits,
  IntentsBitField,
  type Client,
} from "discord.js";
import {
  VoiceConnectionStatus,
  type VoiceConnection,
  type JoinVoiceChannelOptions,
} from "@discordjs/voice";
import type { Logger } from "pino";
import { SqliteStore } from "../../src/database/index.js";
import {
  createVoiceManager,
  type VoiceBackend,
} from "../../src/control/voice.js";
import type {
  OwnerAuthorization,
  VoiceConfig,
} from "../../src/control/contracts.js";
const OWNER = "223456789012345678",
  GUILD = "123456789012345678",
  OTHER = "323456789012345678",
  CHANNEL = "423456789012345678",
  SECOND = "523456789012345678";
const authorization: OwnerAuthorization = {
  isBotOwner: (id) => id === OWNER,
  assertOwner: (id) => {
    if (id !== OWNER) throw new Error("Denied");
  },
  requireBotOwner: async () => false,
};
class Connection extends EventEmitter {
  state = { status: VoiceConnectionStatus.Connecting };
  joinConfig: {
    channelId: string;
    guildId: string;
    selfMute: boolean;
    selfDeaf: boolean;
  };
  rejoin = vi.fn((config: Partial<Connection["joinConfig"]>) => {
    this.joinConfig = { ...this.joinConfig, ...config };
    this.transition(VoiceConnectionStatus.Connecting);
    return true;
  });
  destroy = vi.fn(() => {
    this.transition(VoiceConnectionStatus.Destroyed);
    this.remove();
  });
  constructor(
    options: JoinVoiceChannelOptions,
    private remove: () => void,
  ) {
    super();
    this.joinConfig = {
      channelId: options.channelId,
      guildId: options.guildId,
      selfMute: options.selfMute ?? true,
      selfDeaf: options.selfDeaf ?? true,
    };
  }
  transition(status: VoiceConnectionStatus) {
    const old = this.state;
    this.state = { status };
    this.emit("stateChange", old, this.state);
  }
}
function fixture() {
  const store = new SqliteStore(":memory:"),
    connections = new Map<string, Connection>();
  let allowed = true,
    ready = true;
  const channels = new Map([
    [
      CHANNEL,
      {
        id: CHANNEL,
        guildId: GUILD,
        type: ChannelType.GuildVoice,
        permissionsFor: () => ({ has: () => allowed }),
      },
    ],
    [
      SECOND,
      {
        id: SECOND,
        guildId: OTHER,
        type: ChannelType.GuildVoice,
        permissionsFor: () => ({ has: () => allowed }),
      },
    ],
  ]);
  const guild = (id: string) => ({
    id,
    voiceAdapterCreator: () => ({}),
    channels: {
      fetch: vi.fn(
        async (channelId: string) => channels.get(channelId) ?? null,
      ),
    },
    members: { fetchMe: vi.fn(async () => ({ id: "bot" })) },
  });
  const g1 = guild(GUILD),
    g2 = guild(OTHER);
  const bus = Object.assign(new EventEmitter(), {
    isReady: () => ready,
    user: { id: "bot" },
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
      ]),
    },
    guilds: {
      cache: new Map([
        [GUILD, g1],
        [OTHER, g2],
      ]),
      fetch: vi.fn(async ({ guild: id }: { guild: string }) =>
        id === GUILD ? g1 : g2,
      ),
    },
  });
  const join = vi.fn((options: JoinVoiceChannelOptions) => {
    const connection = new Connection(options, () =>
      connections.delete(options.guildId),
    );
    connections.set(options.guildId, connection);
    return connection as unknown as VoiceConnection;
  });
  const waitReady = vi.fn(async (connection: VoiceConnection) => {
    (connection as unknown as Connection).transition(
      VoiceConnectionStatus.Ready,
    );
    return connection;
  });
  const backend: VoiceBackend = {
    join,
    get: (id) => connections.get(id) as unknown as VoiceConnection | undefined,
    ready: waitReady,
  };
  const logger = { warn: vi.fn() } as unknown as Logger;
  const manager = createVoiceManager(
    bus as unknown as Client,
    store,
    authorization,
    logger,
    backend,
  );
  return {
    store,
    bus,
    connections,
    channels,
    g1,
    g2,
    join,
    waitReady,
    backend,
    logger,
    manager,
    setAllowed: (value: boolean) => {
      allowed = value;
    },
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}
const saved = (guildId = GUILD, channelId = CHANNEL): VoiceConfig => ({
  version: 1,
  guildId,
  channelId,
  autoJoin: true,
  selfMute: true,
  selfDeaf: true,
  manualDisconnect: false,
});
async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}
describe("owner-controlled persistent voice", () => {
  it("defaults to disabled auto join with self mute and deaf enabled", async () => {
    const f = fixture();
    try {
      expect(f.manager.getConfig(GUILD)).toMatchObject({
        autoJoin: false,
        selfMute: true,
        selfDeaf: true,
        manualDisconnect: false,
      });
      await f.manager.start();
      expect(f.join).not.toHaveBeenCalled();
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it.each(["not-an-id", "0", "18446744073709551616"])(
    "rejects invalid voice ID %s",
    async (channelId) => {
      const f = fixture();
      try {
        await expect(
          f.manager.configure(OWNER, GUILD, { channelId }),
        ).rejects.toMatchObject({ key: "runtime.voiceInvalid" });
        expect(f.store.get(GUILD, "runtime", "voice")).toBeUndefined();
        expect(f.join).not.toHaveBeenCalled();
      } finally {
        await f.manager.dispose();
        f.store.close();
      }
    },
  );
  it("validates the current guild, channel type and permissions before saving", async () => {
    const f = fixture();
    try {
      await expect(
        f.manager.configure(OWNER, GUILD, { channelId: SECOND }),
      ).rejects.toMatchObject({ key: "runtime.voiceWrongGuild" });
      f.channels.get(CHANNEL)!.type = ChannelType.GuildText;
      await expect(
        f.manager.configure(OWNER, GUILD, { channelId: CHANNEL }),
      ).rejects.toMatchObject({ key: "runtime.voiceChannelType" });
      f.channels.get(CHANNEL)!.type = ChannelType.GuildVoice;
      f.setAllowed(false);
      await expect(
        f.manager.configure(OWNER, GUILD, { channelId: CHANNEL }),
      ).rejects.toMatchObject({ key: "runtime.voicePermissions" });
      expect(f.store.get(GUILD, "runtime", "voice")).toBeUndefined();
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("starts one auto connection per guild with that guild adapter and flags", async () => {
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      f.store.put(OTHER, "runtime", "voice", {
        ...saved(OTHER, SECOND),
        selfMute: false,
      });
      await f.manager.start();
      expect(f.join).toHaveBeenCalledTimes(2);
      expect(f.join.mock.calls[0]?.[0]).toMatchObject({
        guildId: GUILD,
        channelId: CHANNEL,
        selfMute: true,
        selfDeaf: true,
        adapterCreator: f.g1.voiceAdapterCreator,
      });
      expect(f.join.mock.calls[1]?.[0]).toMatchObject({
        guildId: OTHER,
        channelId: SECOND,
        selfMute: false,
      });
      expect(f.manager.getState(GUILD)).toMatchObject({
        status: "ready",
        channelId: CHANNEL,
      });
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("refuses startup when GuildVoiceStates is missing without crashing the caller", async () => {
    const f = fixture();
    try {
      f.bus.options.intents = new IntentsBitField([GatewayIntentBits.Guilds]);
      f.store.put(GUILD, "runtime", "voice", saved());
      await expect(f.manager.start()).resolves.toBeUndefined();
      expect(f.manager.getState(GUILD)).toMatchObject({
        status: "blocked",
        reason: "runtime.voiceIntent",
      });
      expect(f.join).not.toHaveBeenCalled();
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("serializes simultaneous Connect Now requests and avoids duplicate connections", async () => {
    const f = fixture();
    try {
      await f.manager.configure(OWNER, GUILD, { channelId: CHANNEL });
      await Promise.all([
        f.manager.connect(OWNER, GUILD),
        f.manager.connect(OWNER, GUILD),
      ]);
      expect(f.join).toHaveBeenCalledTimes(1);
      expect(f.connections.get(GUILD)?.rejoin).not.toHaveBeenCalled();
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("uses exponential backoff and stops after five failed retries", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.manager.configure(OWNER, GUILD, { channelId: CHANNEL });
      f.waitReady.mockRejectedValue(new Error("Network unavailable"));
      await expect(f.manager.connect(OWNER, GUILD)).rejects.toThrow("Network");
      expect(f.manager.getState(GUILD).retryCount).toBe(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(f.connections.get(GUILD)?.rejoin).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(f.connections.get(GUILD)?.rejoin).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30000);
      expect(f.manager.getState(GUILD)).toMatchObject({
        status: "blocked",
        retryCount: 5,
        reason: "runtime.voiceRetriesExhausted",
      });
      expect(f.join).toHaveBeenCalledTimes(1);
      expect(f.logger.warn).toHaveBeenCalledTimes(6);
      await vi.advanceTimersByTimeAsync(120000);
      expect(f.join).toHaveBeenCalledTimes(1);
    } finally {
      await f.manager.dispose();
      f.store.close();
      vi.useRealTimers();
    }
  });
  it("logs one localized readiness timeout instead of repeating the same failure in autojoin", async () => {
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      const aborted = new Error("The operation was aborted");
      aborted.name = "AbortError";
      f.waitReady.mockRejectedValueOnce(aborted);
      await f.manager.start();
      expect(f.logger.warn).toHaveBeenCalledOnce();
      expect(f.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.objectContaining({
            key: "runtime.voiceTimeout",
            cause: aborted,
          }),
        }),
        "Voice connection timed out after 15 seconds; security remains operational",
      );
      expect(f.manager.getState(GUILD).status).toBe("retrying");
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("resets retry counters after a successful recovery", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.manager.configure(OWNER, GUILD, { channelId: CHANNEL });
      f.waitReady.mockRejectedValueOnce(new Error("Temporary"));
      await expect(f.manager.connect(OWNER, GUILD)).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.manager.getState(GUILD)).toMatchObject({
        status: "ready",
        retryCount: 0,
      });
    } finally {
      await f.manager.dispose();
      f.store.close();
      vi.useRealTimers();
    }
  });
  it("does not undo manual disconnect, including after manager restart", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      await f.manager.start();
      f.connections.get(GUILD)!.transition(VoiceConnectionStatus.Disconnected);
      await f.manager.disconnect(OWNER, GUILD);
      expect(f.manager.getConfig(GUILD).manualDisconnect).toBe(true);
      await vi.advanceTimersByTimeAsync(60000);
      expect(f.join).toHaveBeenCalledTimes(1);
      await f.manager.dispose();
      const restarted = createVoiceManager(
        f.bus as unknown as Client,
        f.store,
        authorization,
        f.logger,
        f.backend,
      );
      await restarted.start();
      expect(f.join).toHaveBeenCalledTimes(1);
      await restarted.connect(OWNER, GUILD);
      expect(restarted.getConfig(GUILD).manualDisconnect).toBe(false);
      expect(f.join).toHaveBeenCalledTimes(2);
      await restarted.dispose();
    } finally {
      f.store.close();
      vi.useRealTimers();
    }
  });
  it("stops retries when a configured channel is deleted", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      await f.manager.start();
      f.bus.emit(Events.ChannelDelete, { id: CHANNEL, guild: { id: GUILD } });
      await vi.advanceTimersByTimeAsync(60000);
      expect(f.manager.getState(GUILD)).toMatchObject({
        status: "blocked",
        reason: "runtime.voiceChannelMissing",
      });
      expect(f.join).toHaveBeenCalledTimes(1);
    } finally {
      await f.manager.dispose();
      f.store.close();
      vi.useRealTimers();
    }
  });
  it("recovers when the bot is moved away or disconnected by the gateway", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      await f.manager.start();
      const connection = f.connections.get(GUILD)!;
      connection.joinConfig.channelId = SECOND;
      f.bus.emit(
        Events.VoiceStateUpdate,
        {},
        { id: "bot", guild: { id: GUILD }, channelId: SECOND },
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(connection.rejoin).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: CHANNEL }),
      );
      expect(f.manager.getState(GUILD).channelId).toBe(CHANNEL);
    } finally {
      await f.manager.dispose();
      f.store.close();
      vi.useRealTimers();
    }
  });
  it("updates self mute and deaf using the existing connection", async () => {
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      await f.manager.start();
      await f.manager.configure(OWNER, GUILD, {
        selfMute: false,
        selfDeaf: false,
      });
      expect(f.join).toHaveBeenCalledTimes(1);
      expect(f.connections.get(GUILD)?.joinConfig).toMatchObject({
        selfMute: false,
        selfDeaf: false,
      });
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("blocks permanent permission API failures without repeated retries", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      f.g1.members.fetchMe.mockRejectedValue({
        code: 50013,
        message: "Missing permissions",
      });
      await f.manager.start();
      expect(f.manager.getState(GUILD)).toMatchObject({
        status: "blocked",
        reason: "runtime.voicePermissions",
      });
      await vi.advanceTimersByTimeAsync(60000);
      expect(f.g1.members.fetchMe).toHaveBeenCalledTimes(1);
    } finally {
      await f.manager.dispose();
      f.store.close();
      vi.useRealTimers();
    }
  });
  it("does not let database failures escape gateway callbacks", async () => {
    const f = fixture();
    try {
      f.store.put(GUILD, "runtime", "voice", saved());
      await f.manager.start();
      vi.spyOn(f.store, "get").mockImplementation(() => {
        throw new Error("Database unavailable");
      });
      expect(() =>
        f.bus.emit(
          Events.VoiceStateUpdate,
          {},
          { id: "bot", guild: { id: GUILD }, channelId: null },
        ),
      ).not.toThrow();
      expect(() =>
        f.connections
          .get(GUILD)
          ?.transition(VoiceConnectionStatus.Disconnected),
      ).not.toThrow();
      expect(f.logger.warn).toHaveBeenCalled();
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("rejects unauthorized service mutations before database or voice effects", async () => {
    const f = fixture();
    try {
      await expect(
        f.manager.configure("other", GUILD, { channelId: CHANNEL }),
      ).rejects.toThrow("Denied");
      await expect(f.manager.connect("other", GUILD)).rejects.toThrow("Denied");
      await expect(f.manager.disconnect("other", GUILD)).rejects.toThrow(
        "Denied",
      );
      await expect(f.manager.reconnect("other", GUILD)).rejects.toThrow(
        "Denied",
      );
      expect(f.store.get(GUILD, "runtime", "voice")).toBeUndefined();
      expect(f.join).not.toHaveBeenCalled();
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
  it("waits for readiness and restores enabled settings without periodic polling", async () => {
    const f = fixture();
    try {
      f.setReady(false);
      f.store.put(GUILD, "runtime", "voice", saved());
      await f.manager.start();
      expect(f.join).not.toHaveBeenCalled();
      f.setReady(true);
      f.bus.emit(Events.ClientReady, f.bus);
      await flush();
      expect(f.join).toHaveBeenCalledTimes(1);
    } finally {
      await f.manager.dispose();
      f.store.close();
    }
  });
});
