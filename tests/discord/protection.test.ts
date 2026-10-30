import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import {
  Events,
  IntentsBitField,
  GatewayIntentBits,
  type Client,
  type InteractionEditReplyOptions,
} from "discord.js";
import type { Logger } from "pino";
import type { BackupService, Store, GuildConfig } from "../../src/contracts.js";
import { defaultModules, MODULES } from "../../src/security/index.js";
import { installPrivateManagement as installDiscord } from "../helpers/management.js";

import { AuthorizationService } from "../../src/control/authorization.js";
import { testControls } from "../helpers/controls.js";
import { t } from "../../src/locales/index.js";
class MemoryStore implements Store {
  config: GuildConfig = {
    language: "tr",
    mode: "monitor",
    modules: defaultModules(),
    incidentRetentionDays: 30,
    backupRetention: 10,
    backupIntervalHours: 0,
    lockdown: false,
  };
  data = new Map<string, unknown>();
  getConfig() {
    return structuredClone(this.config);
  }
  setConfig(_g: string, c: GuildConfig) {
    this.config = structuredClone(c);
  }
  get<T>(g: string, c: string, id: string) {
    return this.data.get(`${g}/${c}/${id}`) as T | undefined;
  }
  put<T>(g: string, c: string, id: string, value: T) {
    this.data.set(`${g}/${c}/${id}`, structuredClone(value));
  }
  list<T>(g: string, c: string, limit = -1, offset = 0) {
    const rows = [...this.data]
      .filter(([k]) => k.startsWith(`${g}/${c}/`))
      .map(([, v]) => v as T);
    return limit < 0 ? rows.slice(offset) : rows.slice(offset, offset + limit);
  }
  delete(g: string, c: string, id: string) {
    this.data.delete(`${g}/${c}/${id}`);
  }
  claim() {
    return true;
  }
  close() {}
}
function fixture() {
  const store = new MemoryStore();
  const guild = {
    id: "123456789012345678",
    ownerId: "guild-owner",
    verificationLevel: 1,
    setVerificationLevel: vi.fn(async () => undefined),
    members: {
      fetch: vi.fn(async ({ user }: { user: string }) => ({
        id: user,
        guild: { id: "123456789012345678" },
        user: { bot: false },
      })),
      fetchMe: vi.fn(async () => ({
        permissions: { has: () => true },
        roles: { highest: { name: "Guard" } },
      })),
    },
    roles: { fetch: vi.fn(async () => new Map()) },
  };
  const bus = Object.assign(new EventEmitter(), {
    guilds: {
      cache: new Map([[guild.id, guild]]),
      fetch: vi.fn(async () => guild),
    },
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
    ws: { ping: 15 },
    isReady: () => true,
    uptime: 1000,
  });
  const backup = {
    list: vi.fn(() => []),
    create: vi.fn(async () => ({ id: "backup" })),
    preview: vi.fn(),
    restore: vi.fn(),
  } as unknown as BackupService;
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
  const controls = testControls();
  controls.authorization = new AuthorizationService(
    "999999999999999999",
    store,
    logger,
  );
  controls.presence.update = vi.fn(async (_actor, patch) => ({
    ...controls.presence.getConfig(),
    ...patch,
  }));
  controls.voice.configure = vi.fn(async (_actor, guildId, patch) => ({
    ...controls.voice.getConfig(guildId),
    ...patch,
  }));
  controls.voice.connect = vi.fn(async () => {});
  const dispose = installDiscord(
    bus as unknown as Client,
    store,
    { process: vi.fn(async () => undefined) },
    backup,
    logger,
    controls,
  );
  return { store, guild, bus, dispose, backup, controls };
}
function interaction(
  type = "command",
  overrides: Record<string, unknown> = {},
) {
  const value: Record<string, unknown> = {
    guildId: "123456789012345678",
    user: { id: "999999999999999999" },
    commandName: "guard",
    customId: "",
    deferred: false,
    replied: false,
    isChatInputCommand: () => type === "command",
    isMessageComponent: () =>
      ["button", "user", "role", "select", "channel"].includes(type),
    isModalSubmit: () => type === "modal",
    isButton: () => type === "button",
    isStringSelectMenu: () => type === "select",
    isUserSelectMenu: () => type === "user",
    isFromMessage: () => true,
    isChannelSelectMenu: () => type === "channel",
    isRoleSelectMenu: () => type === "role",
    reply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    showModal: vi.fn(async () => {}),
    deferUpdate: vi.fn(async () => {
      value.deferred = true;
    }),
    deferReply: vi.fn(async () => {
      value.deferred = true;
    }),
    ...overrides,
  };
  return value;
}
function options(
  sub: string,
  group: string | null = null,
  strings: Record<string, string> = {},
) {
  return {
    getSubcommand: () => sub,
    getSubcommandGroup: () => group,
    getString: (id: string) => strings[id] ?? null,
    getInteger: () => null,
    getChannel: () => null,
    getBoolean: () => null,
  };
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function output(
  i: ReturnType<typeof interaction>,
): InteractionEditReplyOptions {
  return vi
    .mocked(i.editReply as ReturnType<typeof vi.fn>)
    .mock.calls.at(-1)![0] as InteractionEditReplyOptions;
}
function embedDescription(i: ReturnType<typeof interaction>): string {
  const embed = output(i).embeds![0] as {
    toJSON: () => { description?: string };
  };
  return embed.toJSON().description ?? "";
}
function componentId(
  i: ReturnType<typeof interaction>,
  operation: string,
): string {
  const rows = output(i).components ?? [];
  for (const row of rows) {
    const data = (
      row as { toJSON: () => { components: { custom_id?: string }[] } }
    ).toJSON();
    for (const c of data.components)
      if (c.custom_id?.startsWith(`guard:${operation}:`)) return c.custom_id;
  }
  throw new Error(`Missing component ${operation}`);
}

describe("one-click native protection workflow", () => {
  it.each(["partial", "failed", "unsupported", "uncertain", "skipped"])(
    "shows actual journal %s outcomes as needing review",
    async (status) => {
      const f = fixture();
      f.store.put(f.guild.id, "rollback_attempts", "audit", {
        state: "done",
        outcome: { status, result: "technical detail" },
      });
      const first = interaction("command", { options: options("panel") });
      f.bus.emit(Events.InteractionCreate, first);
      await f.dispose();
      expect(embedDescription(first)).toContain(t("tr", "nuke.recoveryIssue"));
      expect(embedDescription(first)).not.toContain(
        t("tr", "nuke.recoveryRecorded"),
      );
    },
  );
  it("keeps pending recovery visibly unconfirmed and does not call partial privilege removal contained", async () => {
    const f = fixture();
    f.store.put(f.guild.id, "rollback_attempts", "audit", { state: "pending" });
    f.store.put(f.guild.id, "containment_records", "223456789012345678", {
      executorId: "223456789012345678",
      status: "partial",
      removedRoleIds: ["role"],
      updatedAt: Date.now(),
    });
    const first = interaction("command", { options: options("panel") });
    f.bus.emit(Events.InteractionCreate, first);
    await f.dispose();
    expect(embedDescription(first)).toContain(t("tr", "nuke.recoveryPending"));
    expect(embedDescription(first)).not.toContain("<@223456789012345678>");
  });
  it("labels ordinary thread/invite participation as observation-only with no punitive editor", async () => {
    const f = fixture();
    f.store.config.mode = "protect";
    f.store.config.zeroTolerance = true;
    const first = interaction("command", { options: options("modules") });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const choose = interaction("select", {
      customId: componentId(first, "module"),
      values: ["invite.create"],
    });
    f.bus.emit(Events.InteractionCreate, choose);
    await f.dispose();
    expect(embedDescription(choose)).toContain(
      t("tr", "nuke.participationOnly"),
    );
    const rows = output(choose).components!.map((item) =>
      (item as { toJSON: () => unknown }).toJSON(),
    );
    expect(JSON.stringify(rows)).not.toContain("guard:mode-view:");
    expect(JSON.stringify(rows)).not.toContain("guard:response-view:");
  });
  it.each(["tr", "en"] as const)(
    "shows a prominent localized %s protection button",
    async (language) => {
      const f = fixture();
      f.store.config.language = language;
      const i = interaction("command", { options: options("panel") });
      f.bus.emit(Events.InteractionCreate, i);
      await f.dispose();
      expect(componentId(i, "global-protection")).toContain(
        "guard:global-protection:",
      );
      const row = output(i).components!.map((item) =>
        (item as { toJSON: () => unknown }).toJSON(),
      );
      expect(JSON.stringify(row)).toContain(t(language, "nuke.enable"));
      expect(embedDescription(i)).toContain(t(language, "nuke.recoveryNone"));
    },
  );
  it("requires the explicit zero-tolerance warning before activating every eligible protection", async () => {
    const f = fixture();
    for (const p of Object.values(f.store.config.modules)) p.enabled = false;
    const first = interaction("command", { options: options("panel") });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const click = interaction("button", {
      customId: componentId(first, "global-protection"),
    });
    f.bus.emit(Events.InteractionCreate, click);
    await flush();
    expect(f.store.config.mode).toBe("monitor");
    expect(embedDescription(click)).toContain(
      t("tr", "nuke.confirmDescription"),
    );
    const confirm = interaction("button", {
      customId: componentId(click, "confirm"),
    });
    f.bus.emit(Events.InteractionCreate, confirm);
    await f.dispose();
    expect(f.store.config).toMatchObject({
      mode: "protect",
      zeroTolerance: true,
    });
    for (const module of MODULES.filter((module) => module.administrative))
      expect(f.store.config.modules[module.id]).toMatchObject({
        enabled: true,
        mode: "protect",
        threshold: 1,
        action: "strip",
      });
    expect(embedDescription(confirm)).toContain(t("tr", "mode.protect"));
  });
  it("uses the same centralized activation for the existing slash mode route", async () => {
    const f = fixture(),
      first = interaction("command", {
        options: options("mode", null, { value: "protect" }),
      });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    expect(f.store.config.mode).toBe("monitor");
    expect(embedDescription(first)).toContain(
      t("tr", "nuke.confirmDescription"),
    );
    f.bus.emit(
      Events.InteractionCreate,
      interaction("button", { customId: componentId(first, "confirm") }),
    );
    await f.dispose();
    expect(f.store.config.zeroTolerance).toBe(true);
    expect(f.store.config.modules["member.ban"]?.threshold).toBe(1);
  });
  it("switches Protect to Monitor immediately while retaining observations", async () => {
    const f = fixture();
    f.store.config.mode = "protect";
    f.store.config.zeroTolerance = true;
    const first = interaction("command", { options: options("panel") });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const click = interaction("button", {
      customId: componentId(first, "global-protection"),
    });
    f.bus.emit(Events.InteractionCreate, click);
    await f.dispose();
    expect(f.store.config).toMatchObject({
      mode: "monitor",
      zeroTolerance: true,
    });
    expect(f.store.config.modules["channel.create"]).toMatchObject({
      enabled: true,
      mode: "monitor",
    });
    expect(componentId(click, "global-protection")).toBeTruthy();
  });
  it("rejects an old activation confirmation after another setting changes", async () => {
    const f = fixture(),
      first = interaction("command", {
        options: options("mode", null, { value: "protect" }),
      });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    f.store.config.notificationsEnabled = false;
    const confirm = interaction("button", {
      customId: componentId(first, "confirm"),
    });
    f.bus.emit(Events.InteractionCreate, confirm);
    await f.dispose();
    expect(f.store.config.mode).toBe("monitor");
    expect(embedDescription(confirm)).toContain(t("tr", "control.stale"));
  });
  it("denies a different administrator before the global control can change state", async () => {
    const f = fixture(),
      first = interaction("command", { options: options("panel") });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const click = interaction("button", {
      customId: componentId(first, "global-protection"),
      user: { id: "guild-owner" },
      memberPermissions: { has: () => true },
    });
    f.bus.emit(Events.InteractionCreate, click);
    await f.dispose();
    expect(f.store.config.mode).toBe("monitor");
    expect(click.deferUpdate).not.toHaveBeenCalled();
    expect(click.reply).toHaveBeenCalled();
  });
});
