import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Collection,
  GatewayIntentBits,
  IntentsBitField,
  Events,
  type Client,
} from "discord.js";
import type { Logger } from "pino";
import type {
  RestartProtection,
  RestartSession,
} from "../../src/restart/contracts.js";
import type {
  ManagementControls,
  VoiceState,
  VoiceConfig,
} from "../../src/control/contracts.js";
import { SqliteStore } from "../../src/database/index.js";
import {
  createStartupCoordinator,
  buildStartupEmbed,
  type StartupOptions,
} from "../../src/startup/index.js";

const GUILD = "123456789012345678",
  CHANNEL = "223456789012345678",
  PANEL = "323456789012345678";
const databases: SqliteStore[] = [];
afterEach(() => {
  for (const store of databases.splice(0)) store.close();
  vi.useRealTimers();
});
function setup(language: "tr" | "en" = "tr") {
  const store = new SqliteStore(":memory:");
  databases.push(store);
  store.setConfig(GUILD, { ...store.getConfig(GUILD), language });
  store.put(GUILD, "permanent_panel", "main", {
    version: 1,
    panelChannelId: CHANNEL,
    panelMessageId: PANEL,
    panelCreatedAt: 1,
    panelEnabled: true,
    panelLanguage: language,
    status: "ready",
  });
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
  const send = vi.fn<(payload: unknown) => Promise<{ id: string }>>(
    async () => ({ id: "423456789012345678" }),
  );
  const permissions = { has: vi.fn(() => true) };
  const guild = {
    id: GUILD,
    members: {
      me: { permissions },
      fetchMe: vi.fn(async () => ({ permissions })),
    },
  };
  const channel = {
    id: CHANNEL,
    guild,
    send,
    permissionsFor: vi.fn(() => permissions),
  };
  const client = Object.assign(new EventEmitter(), {
    user: { id: "523456789012345678" },
    isReady: vi.fn(() => true),
    guilds: {
      cache: new Collection([[GUILD, guild]]),
      fetch: vi.fn(async () => guild),
    },
    channels: { fetch: vi.fn(async () => channel) },
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
  });
  let voice: VoiceState = { status: "disconnected", retryCount: 0 };
  let voiceConfig: VoiceConfig = {
    version: 1,
    guildId: GUILD,
    autoJoin: false,
    selfMute: true,
    selfDeaf: true,
    manualDisconnect: false,
  };
  const controls = {
    authorization: {
      isBotOwner: () => true,
      assertOwner: () => undefined,
      requireBotOwner: async () => true,
    },
    presence: {
      start: vi.fn(async () => undefined),
      getState: () => ({ applied: true }),
    },
    voice: {
      start: vi.fn(async () => undefined),
      getState: () => voice,
      getConfig: () => voiceConfig,
    },
  } as unknown as ManagementControls;
  const restorePanels = vi.fn(async () => undefined);
  const options: StartupOptions = {
    restorePanels,
    coreReady: () => true,
    now: () => 1800000000000,
    readinessTimeoutMs: 100,
  };
  const create = () =>
    createStartupCoordinator(
      client as unknown as Client,
      store,
      controls,
      logger,
      options,
    );
  return {
    store,
    logger,
    send,
    permissions,
    guild,
    channel,
    client,
    controls,
    options,
    create,
    restorePanels,
    voice: (value: VoiceState) => {
      voice = value;
    },
    voiceConfig: (patch: Partial<VoiceConfig>) => {
      voiceConfig = { ...voiceConfig, ...patch };
    },
  };
}
const restartSession = (
  state: RestartSession["state"] = "LOCKED",
): RestartSession => ({
  version: 1,
  id: "maintenance",
  guildId: GUILD,
  initiatedBy: "owner",
  createdAt: 1,
  updatedAt: 2,
  originalMode: "protect",
  state,
  canActivate: true,
  risks: [],
  transitions: [{ state, at: 2 }],
  roles: [
    {
      roleId: "role",
      name: "Moderator",
      originalPermissions: "24",
      removedPermissions: "8",
      lockedPermissions: "16",
      actualPermissions: "16",
      position: 1,
      manageable: true,
      status: state === "COMPLETED" ? "restored" : "locked",
    },
  ],
});
function restartControls(
  existing: RestartSession,
  recover = vi.fn(async () => restartSession("COMPLETED")),
) {
  return {
    get: () => existing,
    recover,
    prepare: vi.fn(),
    activate: vi.fn(),
    restore: vi.fn(),
    cancel: vi.fn(),
    drain: vi.fn(async () => undefined),
  } as unknown as RestartProtection;
}
describe("coordinated startup", () => {
  it("reconciles maintenance before refreshing panels and sending one recovery report", async () => {
    const f = setup();
    const recover = vi.fn(async () => restartSession("COMPLETED"));
    f.controls.restart = restartControls(restartSession(), recover);
    const refresh = vi.fn(async () => undefined);
    f.options.refreshPanels = refresh;
    const report = (await f.create().start())[0]!;
    expect(report).toMatchObject({
      restart: "COMPLETED",
      recovery: { restored: 1, total: 1, conflicts: 0 },
      notification: "sent",
    });
    expect(recover).toHaveBeenCalledOnce();
    expect(recover.mock.invocationCallOrder[0]).toBeLessThan(
      f.restorePanels.mock.invocationCallOrder[0]!,
    );
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      f.send.mock.invocationCallOrder[0]!,
    );
    expect(f.send).toHaveBeenCalledOnce();
  });
  it("retains an active lock without calling recovery when core is not ready", async () => {
    const f = setup();
    const recover = vi.fn(async () => restartSession("COMPLETED"));
    f.controls.restart = restartControls(restartSession(), recover);
    f.options.coreReady = () => false;
    const report = (await f.create().start())[0]!;
    expect(recover).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      restart: "LOCKED",
      healthy: false,
      recovery: { restored: 0 },
    });
  });
  it.each(["tr", "en"] as const)(
    "localizes incomplete recovery in %s without a second notification",
    async (language) => {
      const f = setup(language);
      const session = restartSession("MANUAL_RECOVERY_REQUIRED");
      session.roles[0]!.status = "conflict";
      f.controls.restart = restartControls(
        restartSession(),
        vi.fn(async () => session),
      );
      const report = (await f.create().start())[0]!;
      expect(report).toMatchObject({
        restart: "MANUAL_RECOVERY_REQUIRED",
        healthy: false,
        recovery: { conflicts: 1 },
      });
      const embed = (
        f.send.mock.calls[0]![0] as { embeds: { toJSON(): unknown }[] }
      ).embeds[0]!.toJSON();
      expect(JSON.stringify(embed)).toContain(
        language === "tr"
          ? "Elle kurtarma gerekiyor"
          : "Manual recovery required",
      );
      expect(f.send).toHaveBeenCalledOnce();
    },
  );
  it("reports recovery rejection as unavailable and continues optional startup", async () => {
    const f = setup();
    f.controls.restart = restartControls(
      restartSession(),
      vi.fn(async () => {
        throw new Error("journal conflict");
      }),
    );
    expect((await f.create().start())[0]).toMatchObject({
      restart: "unavailable",
      healthy: false,
      notification: "sent",
    });
    expect(f.controls.voice.start).toHaveBeenCalledOnce();
  });
  it("reports a timed-out recovery as pending and does not create duplicate announcements later", async () => {
    vi.useFakeTimers();
    const f = setup();
    let finish!: (session: RestartSession) => void;
    const recover = vi.fn(
      () =>
        new Promise<RestartSession>((resolve) => {
          finish = resolve;
        }),
    );
    f.controls.restart = restartControls(restartSession(), recover);
    const startup = f.create().start();
    await vi.advanceTimersByTimeAsync(101);
    expect((await startup)[0]).toMatchObject({
      restart: "pending",
      healthy: false,
    });
    finish(restartSession("COMPLETED"));
    await Promise.resolve();
    expect(f.send).toHaveBeenCalledOnce();
  });
  it("waits for recovery before notifying and invokes it only once across repeated starts", async () => {
    const f = setup();
    let finish!: (session: RestartSession) => void;
    const recover = vi.fn(
      () =>
        new Promise<RestartSession>((resolve) => {
          finish = resolve;
        }),
    );
    f.controls.restart = restartControls(restartSession(), recover);
    const coordinator = f.create(),
      first = coordinator.start();
    for (let n = 0; n < 8; n++) await Promise.resolve();
    expect(f.send).not.toHaveBeenCalled();
    finish(restartSession("COMPLETED"));
    await first;
    await coordinator.start();
    expect(recover).toHaveBeenCalledOnce();
    expect(f.send).toHaveBeenCalledOnce();
  });
  it("does not replay a completed session", async () => {
    const f = setup();
    const recover = vi.fn(async () => restartSession("COMPLETED"));
    f.controls.restart = restartControls(restartSession("COMPLETED"), recover);
    expect((await f.create().start())[0]!.restart).toBe("COMPLETED");
    expect(recover).not.toHaveBeenCalled();
  });
  it("isolates recovery failures between guilds", async () => {
    const f = setup();
    const other = "623456789012345678";
    f.client.guilds.cache.set(other, { ...f.guild, id: other });
    const recover = vi.fn(async (guildId: string) => {
      if (guildId === GUILD) throw new Error("first guild failure");
      return { ...restartSession("COMPLETED"), guildId };
    });
    f.controls.restart = {
      ...restartControls(restartSession()),
      get: (guildId) => ({ ...restartSession(), guildId }),
      recover,
    };
    const reports = await f.create().start();
    expect(reports.find((report) => report.guildId === GUILD)).toMatchObject({
      restart: "unavailable",
      healthy: false,
    });
    expect(reports.find((report) => report.guildId === other)).toMatchObject({
      restart: "COMPLETED",
      healthy: true,
    });
  });
  it("surfaces a corrupt journal instead of reporting no lockdown", async () => {
    const f = setup();
    f.controls.restart = restartControls(restartSession());
    f.controls.restart.get = () => {
      throw new Error("checksum failed");
    };
    expect((await f.create().start())[0]).toMatchObject({
      restart: "unavailable",
      healthy: false,
    });
  });
  it("sends a separate normal Turkish embed to the saved panel channel with real state and no mentions", async () => {
    const f = setup();
    const original = f.store.get(GUILD, "permanent_panel", "main");
    const reports = await f.create().start();
    expect(reports[0]).toMatchObject({
      mode: "monitor",
      active: 0,
      database: "connected",
      panel: "restored",
      voice: "disabled",
      healthy: true,
      notification: "sent",
    });
    expect(f.client.channels.fetch).toHaveBeenCalledWith(CHANNEL);
    const body = f.send.mock.calls[0]![0] as never;
    const payload = body as {
      embeds: Array<{
        toJSON(): {
          title?: string;
          fields?: Array<{ value: string }>;
          footer?: { text: string };
        };
      }>;
      allowedMentions: { parse: string[] };
      enforceNonce: boolean;
      nonce: string;
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.title).toBe("🟢 Ultimate Guard — Çevrimiçi");
    expect(
      embed.fields?.some((field) => field.value === "<t:1800000000:F>"),
    ).toBe(true);
    expect(embed.footer?.text).toContain("Casi");
    expect(payload.allowedMentions.parse).toEqual([]);
    expect(payload.enforceNonce).toBe(true);
    expect(f.store.get(GUILD, "permanent_panel", "main")).toEqual(original);
  });
  it("uses the persisted English guild language", async () => {
    const f = setup("en");
    await f.create().start();
    expect(
      (
        f.send.mock.calls[0]![0] as {
          embeds: Array<{ toJSON(): { title?: string } }>;
        }
      ).embeds[0]!.toJSON().title,
    ).toBe("🟢 Ultimate Guard — Online");
  });
  it("shares one initialization promise and never repeats for reconnect or repeated readiness", async () => {
    const f = setup();
    const coordinator = f.create();
    const first = coordinator.start();
    expect(coordinator.start()).toBe(first);
    await first;
    f.client.emit(Events.ClientReady, f.client);
    f.client.emit(Events.ShardResume, 0, 1);
    await coordinator.start();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.restorePanels).toHaveBeenCalledTimes(1);
  });
  it("a new process coordinator sends a new notification without rewriting old notification or panel", async () => {
    const f = setup();
    await f.create().start();
    await f.create().start();
    expect(f.send).toHaveBeenCalledTimes(2);
  });
  it("counts unique valid unexpired whitelist principals including scoped entries", async () => {
    const f = setup();
    const entry = {
      id: "a",
      kind: "user",
      subjectId: "777777777777777777",
      actions: ["role.update"],
    };
    f.store.put(GUILD, "whitelist", "a", entry);
    f.store.put(GUILD, "whitelist", "b", { ...entry, id: "b" });
    f.store.put(GUILD, "whitelist", "c", {
      ...entry,
      id: "c",
      subjectId: "888888888888888888",
      expiresAt: 0,
    });
    f.store.put(GUILD, "whitelist", "d", { invalid: true });
    expect((await f.create().start())[0]!.whitelist).toBe(1);
  });
  it("reports pending voice without claiming it is connected", async () => {
    const f = setup();
    f.voiceConfig({ autoJoin: true });
    f.voice({ status: "connecting", retryCount: 0 });
    const report = (await f.create().start())[0]!;
    expect(report.voice).toBe("pending");
    expect(report.healthy).toBe(false);
    expect(buildStartupEmbed("en", report).toJSON().fields?.[4]?.value).toBe(
      "Pending",
    );
  });
  it("preserves disabled autojoin and manual disconnect without connecting explicitly", async () => {
    const f = setup();
    f.voiceConfig({ autoJoin: true, manualDisconnect: true });
    expect((await f.create().start())[0]!.voice).toBe("paused");
  });
  it("reports ready only when voice manager confirms connection", async () => {
    const f = setup();
    f.voiceConfig({ autoJoin: true });
    f.voice({ status: "ready", retryCount: 0, channelId: CHANNEL });
    expect((await f.create().start())[0]!.voice).toBe("connected");
  });
  it("waits for original panel restoration before sending", async () => {
    const f = setup();
    let finish!: () => void;
    f.options.restorePanels = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const pending = f.create().start();
    for (let n = 0; n < 12; n++) await Promise.resolve();
    expect(f.send).not.toHaveBeenCalled();
    finish();
    expect((await pending)[0]!.panel).toBe("restored");
  });
  it("allows notification to existing panel channel when panel message was deleted", async () => {
    const f = setup();
    f.options.restorePanels = async () => {
      f.store.put(GUILD, "permanent_panel", "main", {
        ...f.store.get<object>(GUILD, "permanent_panel", "main"),
        status: "unavailable",
      });
    };
    expect((await f.create().start())[0]).toMatchObject({
      panel: "unavailable",
      notification: "sent",
      healthy: false,
    });
  });
  it("skips absent panel without posting to guessed channel", async () => {
    const f = setup();
    f.store.delete(GUILD, "permanent_panel", "main");
    expect((await f.create().start())[0]!.notification).toBe("skipped");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("isolates missing permissions and does not retry uncertain sends", async () => {
    const f = setup();
    f.permissions.has.mockImplementation(() => false);
    expect((await f.create().start())[0]!.notification).toBe("failed");
    expect(f.send).not.toHaveBeenCalled();
    f.permissions.has.mockImplementation(() => true);
    f.send.mockRejectedValueOnce(new Error("network timeout"));
    const coordinator = f.create();
    await coordinator.start();
    await coordinator.start();
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("isolates a deleted notification channel", async () => {
    const f = setup();
    f.client.channels.fetch.mockResolvedValueOnce(null as never);
    expect((await f.create().start())[0]!.notification).toBe("failed");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("isolates delivery failures between guilds", async () => {
    const f = setup();
    const second = "923456789012345678";
    const other = { ...f.guild, id: second };
    f.client.guilds.cache.set(second, other);
    f.store.setConfig(second, { ...f.store.getConfig(second), language: "en" });
    f.store.put(second, "permanent_panel", "main", {
      version: 1,
      panelChannelId: "823456789012345678",
      panelMessageId: PANEL,
      panelEnabled: true,
      status: "ready",
    });
    f.client.channels.fetch.mockImplementation(async (channelId?: unknown) => {
      if (channelId === CHANNEL) throw new Error("Guild one channel missing");
      return { ...f.channel, guild: other };
    });
    const reports = await f.create().start();
    expect(
      reports.find((report) => report.guildId === GUILD)?.notification,
    ).toBe("failed");
    expect(
      reports.find((report) => report.guildId === second)?.notification,
    ).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("does not fabricate readiness when core initialization fails", async () => {
    const f = setup();
    f.options.coreReady = () => false;
    const report = (await f.create().start())[0]!;
    expect(report.healthy).toBe(false);
    expect(buildStartupEmbed("tr", report).toJSON().title).toContain("Dikkat");
  });
  it("reports persisted selective Protect settings and available active modules without resetting them", async () => {
    const f = setup();
    const config = f.store.getConfig(GUILD);
    const saved = {
      ...config,
      mode: "protect" as const,
      modules: {
        ...config.modules,
        "channel.create": {
          ...config.modules["channel.create"]!,
          enabled: true,
          mode: "protect" as const,
        },
      },
    };
    f.store.setConfig(GUILD, saved);
    expect((await f.create().start())[0]).toMatchObject({
      mode: "protect",
      active: 1,
      healthy: true,
    });
    expect(f.store.getConfig(GUILD)).toEqual(saved);
  });
  it("retains zero-tolerance Protect while warning about unavailable trusted recovery baseline", async () => {
    const f = setup();
    f.store.setConfig(GUILD, {
      ...f.store.getConfig(GUILD),
      mode: "protect",
      zeroTolerance: true,
    });
    const report = (await f.create().start())[0]!;
    expect(report).toMatchObject({
      mode: "protect",
      zeroTolerance: true,
      healthy: false,
    });
    expect(report.active).toBeGreaterThan(0);
    expect(f.store.getConfig(GUILD).mode).toBe("protect");
  });
  it("never reports a failed database restoration as healthy or overwrites saved modes", async () => {
    const f = setup();
    vi.spyOn(f.store, "getConfig").mockImplementation(() => {
      throw new Error("Corrupt config");
    });
    expect((await f.create().start())[0]).toMatchObject({
      database: "unavailable",
      healthy: false,
      mode: "unavailable",
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it("bounds optional restoration and reports unstarted autojoin as pending", async () => {
    vi.useFakeTimers();
    const f = setup();
    f.voiceConfig({ autoJoin: true });
    f.controls.voice.start = () => new Promise<void>(() => undefined);
    const result = f.create().start();
    await vi.advanceTimersByTimeAsync(101);
    expect((await result)[0]!.voice).toBe("pending");
    expect(f.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ component: "voice", outcome: "timeout" }),
      expect.any(String),
    );
  });
  it("isolates rejected optional restoration and reports failure rather than pending success", async () => {
    const f = setup();
    f.voiceConfig({ autoJoin: true });
    f.controls.voice.start = async () => {
      throw new Error("Voice unavailable");
    };
    f.options.restorePanels = async () => {
      throw new Error("Panel unavailable");
    };
    const report = (await f.create().start())[0]!;
    expect(report).toMatchObject({
      panel: "unavailable",
      voice: "unavailable",
      healthy: false,
      notification: "sent",
    });
    expect(f.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ component: "voice", outcome: "failed" }),
      expect.any(String),
    );
  });
  it("disposal before startup creates no notifications", async () => {
    const f = setup();
    const coordinator = f.create();
    await coordinator.dispose();
    expect(await coordinator.start()).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("requires actual Discord readiness", async () => {
    const f = setup();
    f.client.isReady.mockReturnValue(false);
    await expect(f.create().start()).rejects.toThrow("ready Discord");
    expect(f.send).not.toHaveBeenCalled();
  });
});
