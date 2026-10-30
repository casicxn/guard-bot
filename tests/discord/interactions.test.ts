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
import type {
  BackupService,
  Store,
  GuildConfig,
  WhitelistEntry,
} from "../../src/contracts.js";
import { defaultModules } from "../../src/security/index.js";
import { installPrivateManagement as installDiscord } from "../helpers/management.js";
import { validateLimits } from "../../src/discord/management.js";
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

describe("management security and bilingual UX", () => {
  it("authorizes the global owner before acknowledgement and resource lookup", async () => {
    const f = fixture(),
      order: string[] = [];
    f.bus.guilds.fetch.mockImplementation(async () => {
      order.push("fetch");
      return f.guild;
    });
    const i = interaction("command", {
      options: options("mode", null, { value: "monitor" }),
    });
    vi.mocked(i.deferReply as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        order.push("defer");
        i.deferred = true;
      },
    );
    const save = vi.spyOn(f.store, "setConfig");
    f.bus.emit(Events.InteractionCreate, i);
    await f.dispose();
    expect(order[0]).toBe("defer");
    expect(order.slice(1).every((step) => step === "fetch")).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });
  it.each(["guild-owner", "admin", "whitelisted"])(
    "denies %s before acknowledgement or mutation",
    async (userId) => {
      const f = fixture();
      f.store.put(f.guild.id, "whitelist", "entry", {
        id: "entry",
        kind: "user",
        subjectId: userId,
        actions: ["*"],
      });
      const save = vi.spyOn(f.store, "setConfig");
      const i = interaction("command", {
        user: { id: userId },
        memberPermissions: { has: () => true },
        options: options("mode", null, { value: "protect" }),
      });
      f.bus.emit(Events.InteractionCreate, i);
      await f.dispose();
      expect(save).not.toHaveBeenCalled();
      expect(i.deferReply).not.toHaveBeenCalled();
      expect(f.bus.guilds.fetch).not.toHaveBeenCalled();
      expect(i.reply).toHaveBeenCalledOnce();
    },
  );
  it("hides raw lookup failures from the user", async () => {
    const f = fixture();
    f.bus.guilds.fetch.mockRejectedValue(
      new Error("private request stack / token=secret"),
    );
    const i = interaction("command", { options: options("help") });
    f.bus.emit(Events.InteractionCreate, i);
    await f.dispose();
    expect(embedDescription(i)).not.toContain("secret");
    expect(embedDescription(i)).toBe(t("tr", "error.generic"));
  });
  it("rejects forged panel controls without changing data", async () => {
    const f = fixture(),
      save = vi.spyOn(f.store, "setConfig");
    const i = interaction("select", {
      customId: "guard:language:forged",
      values: ["en"],
    });
    f.bus.emit(Events.InteractionCreate, i);
    await f.dispose();
    expect(save).not.toHaveBeenCalled();
    expect(i.deferUpdate).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledOnce();
  });
  it.each([
    ["tr", "en"],
    ["en", "tr"],
  ] as const)(
    "switches language from %s to %s immediately without resetting policy",
    async (initial, target) => {
      const f = fixture();
      f.store.config.language = initial;
      const first = interaction("command", { options: options("panel") });
      f.bus.emit(Events.InteractionCreate, first);
      await flush();
      const navigate = interaction("select", {
        customId: componentId(first, "section"),
        values: ["settings"],
      });
      f.bus.emit(Events.InteractionCreate, navigate);
      await flush();
      const language = interaction("select", {
        customId: componentId(navigate, "language"),
        values: [target],
      });
      f.bus.emit(Events.InteractionCreate, language);
      await flush();
      expect(f.store.config.language).toBe(target);
      expect(f.store.config.mode).toBe("monitor");
      expect(embedDescription(language)).toContain(
        target === "en" ? "Language:" : "Dil:",
      );
      await f.dispose();
    },
  );
  it("shows friendly protections and opens an editable limit form without module IDs", async () => {
    const f = fixture(),
      i = interaction("command", { options: options("limits") });
    f.bus.emit(Events.InteractionCreate, i);
    await flush();
    expect(embedDescription(i)).not.toContain("guild.update");
    const select = interaction("select", {
      customId: componentId(i, "module"),
      values: ["member.ban"],
    });
    f.bus.emit(Events.InteractionCreate, select);
    await flush();
    const edit = interaction("button", {
      customId: componentId(select, "limit-edit"),
    });
    f.bus.emit(Events.InteractionCreate, edit);
    await flush();
    expect(edit.showModal).toHaveBeenCalledOnce();
    expect(edit.deferUpdate).not.toHaveBeenCalled();
    const modal = vi.mocked(edit.showModal as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    const submit = interaction("modal", {
      customId: modal.data.custom_id,
      fields: {
        getTextInputValue: (id: string) => (id === "count" ? "7" : "90"),
      },
    });
    f.bus.emit(Events.InteractionCreate, submit);
    await f.dispose();
    expect(f.store.config.modules["member.ban"]?.threshold).toBe(7);
    expect(f.store.config.modules["member.ban"]?.windowMs).toBe(90000);
    expect(f.store.config.mode).toBe("monitor");
  });
  it("rejects invalid limit form values without altering protection", async () => {
    const f = fixture(),
      i = interaction("command", { options: options("limits") });
    f.bus.emit(Events.InteractionCreate, i);
    await flush();
    const edit = interaction("button", {
      customId: componentId(i, "limit-edit"),
    });
    f.bus.emit(Events.InteractionCreate, edit);
    await flush();
    const modal = vi.mocked(edit.showModal as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    const submit = interaction("modal", {
      customId: modal.data.custom_id,
      fields: {
        getTextInputValue: (id: string) => (id === "count" ? "0" : "60"),
      },
    });
    f.bus.emit(Events.InteractionCreate, submit);
    await f.dispose();
    expect(f.store.config.modules["guild.update"]?.threshold).toBe(1);
    expect(embedDescription(submit)).toBe(t("tr", "panel.limitCountError"));
  });
  it("adds a selected user with all-module access and no technical permission form", async () => {
    const f = fixture(),
      i = interaction("command", { options: options("list", "whitelist") });
    f.bus.emit(Events.InteractionCreate, i);
    await flush();
    const selected = interaction("user", {
      customId: componentId(i, "trust-user"),
      values: ["223456789012345678"],
    });
    f.bus.emit(Events.InteractionCreate, selected);
    await f.dispose();
    expect(selected.showModal).not.toHaveBeenCalled();
    expect(
      f.store.list<WhitelistEntry>(f.guild.id, "whitelist")[0]?.actions,
    ).toEqual(["*"]);
    expect(embedDescription(selected)).toContain(
      t("tr", "control.whitelistIntro"),
    );
  });
  it("keeps global owner authorized when guild ownership changes", async () => {
    const f = fixture();
    f.bus.guilds.fetch.mockResolvedValue({
      ...f.guild,
      ownerId: "other-guild-owner",
    });
    const i = interaction("command", {
      options: options("mode", null, { value: "monitor" }),
    });
    f.bus.emit(Events.InteractionCreate, i);
    await f.dispose();
    expect(f.store.config.mode).toBe("monitor");
    expect(i.reply).not.toHaveBeenCalled();
  });
  it("requires confirmation and rejects stale Protect changes", async () => {
    const f = fixture();
    const i = interaction("command", {
      options: options("mode", null, { value: "protect" }),
    });
    f.bus.emit(Events.InteractionCreate, i);
    await flush();
    expect(f.store.config.mode).toBe("monitor");
    const confirm = interaction("button", {
      customId: componentId(i, "confirm"),
    });
    f.store.config.backupRetention = 11;
    f.bus.emit(Events.InteractionCreate, confirm);
    await f.dispose();
    expect(f.store.config.mode).toBe("monitor");
    expect(embedDescription(confirm)).toBe(t("tr", "control.stale"));
  });
  it("applies a confirmed Protect change once", async () => {
    const f = fixture();
    const i = interaction("command", {
      options: options("mode", null, { value: "protect" }),
    });
    f.bus.emit(Events.InteractionCreate, i);
    await flush();
    const id = componentId(i, "confirm");
    const confirm = interaction("button", { customId: id });
    f.bus.emit(Events.InteractionCreate, confirm);
    await flush();
    expect(f.store.config.mode).toBe("protect");
    const save = vi.spyOn(f.store, "setConfig");
    f.bus.emit(
      Events.InteractionCreate,
      interaction("button", { customId: id }),
    );
    await f.dispose();
    expect(save).not.toHaveBeenCalled();
  });
  it("requires selected whitelist removal confirmation", async () => {
    const f = fixture();
    const subject = "223456789012345678";
    f.store.put(f.guild.id, "whitelist", "entry", {
      id: "entry",
      kind: "user",
      subjectId: subject,
      actions: ["*"],
    });
    const first = interaction("command", {
      options: options("list", "whitelist"),
    });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const choose = interaction("select", {
      customId: componentId(first, "whitelist-remove"),
      values: [subject],
    });
    f.bus.emit(Events.InteractionCreate, choose);
    await flush();
    expect(f.store.list(f.guild.id, "whitelist")).toHaveLength(1);
    f.bus.emit(
      Events.InteractionCreate,
      interaction("button", { customId: componentId(choose, "confirm") }),
    );
    await f.dispose();
    expect(f.store.list(f.guild.id, "whitelist")).toHaveLength(0);
  });
  it("requires explicit confirmation before expanding a legacy whitelist entry", async () => {
    const f = fixture();
    const subject = "223456789012345678";
    f.store.put(f.guild.id, "whitelist", "entry", {
      id: "entry",
      kind: "user",
      subjectId: subject,
      actions: ["channel.create"],
    });
    const first = interaction("command", {
      options: options("add", "whitelist", { subject }),
    });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    expect(
      f.store.list<WhitelistEntry>(f.guild.id, "whitelist")[0]!.actions,
    ).toEqual(["channel.create"]);
    f.bus.emit(
      Events.InteractionCreate,
      interaction("button", { customId: componentId(first, "confirm") }),
    );
    await f.dispose();
    const entry = f.store.list<WhitelistEntry>(f.guild.id, "whitelist")[0]!;
    expect(entry.actions).toEqual(["*"]);
    expect(entry.addedBy).toBe("999999999999999999");
  });
  it("keeps emergency verification and its restoration record when resetting guard settings", async () => {
    const f = fixture();
    f.store.config.lockdown = true;
    f.store.config.mode = "protect";
    f.store.put(f.guild.id, "lockdown", "verification", { level: 1 });
    f.store.put(f.guild.id, "whitelist", "keep", {
      id: "keep",
      kind: "user",
      subjectId: "223456789012345678",
      actions: ["*"],
    });
    const first = interaction("command", { options: options("panel") });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const settings = interaction("select", {
      customId: componentId(first, "section"),
      values: ["settings"],
    });
    f.bus.emit(Events.InteractionCreate, settings);
    await flush();
    const reset = interaction("button", {
      customId: componentId(settings, "reset"),
    });
    f.bus.emit(Events.InteractionCreate, reset);
    await flush();
    expect(f.store.config.mode).toBe("protect");
    f.bus.emit(
      Events.InteractionCreate,
      interaction("button", { customId: componentId(reset, "confirm") }),
    );
    await f.dispose();
    expect(f.store.config.mode).toBe("monitor");
    expect(f.store.config.lockdown).toBe(true);
    expect(f.store.get(f.guild.id, "lockdown", "verification")).toEqual({
      level: 1,
    });
    expect(f.store.list(f.guild.id, "whitelist")).toHaveLength(1);
    expect(f.guild.setVerificationLevel).not.toHaveBeenCalled();
  });
  it("requires confirmation before slash emergency verification changes", async () => {
    const f = fixture();
    const first = interaction("command", {
      options: { ...options("lockdown"), getBoolean: () => true },
    });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    expect(f.guild.setVerificationLevel).not.toHaveBeenCalled();
    expect(f.store.config.lockdown).toBe(false);
    f.bus.emit(
      Events.InteractionCreate,
      interaction("button", { customId: componentId(first, "confirm") }),
    );
    await f.dispose();
    expect(f.guild.setVerificationLevel).toHaveBeenCalledWith(
      4,
      expect.any(String),
    );
    expect(f.store.config.lockdown).toBe(true);
  });
  it("exposes emergency verification in settings and rejects a stale confirmation", async () => {
    const f = fixture();
    const first = interaction("command", { options: options("panel") });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const settings = interaction("select", {
      customId: componentId(first, "section"),
      values: ["settings"],
    });
    f.bus.emit(Events.InteractionCreate, settings);
    await flush();
    const mode = interaction("button", {
      customId: componentId(settings, "settings-mode"),
    });
    f.bus.emit(Events.InteractionCreate, mode);
    await flush();
    const lockdown = interaction("button", {
      customId: componentId(mode, "lockdown"),
    });
    f.bus.emit(Events.InteractionCreate, lockdown);
    await flush();
    expect(f.guild.setVerificationLevel).not.toHaveBeenCalled();
    f.store.config.backupRetention = 12;
    const confirm = interaction("button", {
      customId: componentId(lockdown, "confirm"),
    });
    f.bus.emit(Events.InteractionCreate, confirm);
    await f.dispose();
    expect(f.guild.setVerificationLevel).not.toHaveBeenCalled();
    expect(embedDescription(confirm)).toBe(t("tr", "control.stale"));
  });
  it("keeps bot profile read-only and dispatches voice controls with the global actor", async () => {
    const f = fixture();
    const first = interaction("command", { options: options("panel") });
    f.bus.emit(Events.InteractionCreate, first);
    await flush();
    const presence = interaction("select", {
      customId: componentId(first, "section"),
      values: ["presence"],
    });
    f.bus.emit(Events.InteractionCreate, presence);
    await flush();
    expect(JSON.stringify(output(presence))).not.toContain(
      "guard:presence-status:",
    );
    expect(JSON.stringify(output(presence))).not.toContain(
      "guard:presence-text:",
    );
    const obsolete = interaction("select", {
      customId: componentId(presence, "section").replace(
        "guard:section:",
        "guard:presence-status:",
      ),
      values: ["dnd"],
    });
    f.bus.emit(Events.InteractionCreate, obsolete);
    await flush();
    expect(f.controls.presence.update).not.toHaveBeenCalled();
    const voice = interaction("select", {
      customId: componentId(presence, "section"),
      values: ["voice"],
    });
    f.bus.emit(Events.InteractionCreate, voice);
    await flush();
    const channel = interaction("channel", {
      customId: componentId(voice, "voice-channel"),
      values: ["323456789012345678"],
    });
    f.bus.emit(Events.InteractionCreate, channel);
    await flush();
    expect(f.controls.voice.configure).toHaveBeenCalledWith(
      "999999999999999999",
      f.guild.id,
      { channelId: "323456789012345678" },
    );
    const connect = interaction("select", {
      customId: componentId(channel, "voice-action"),
      values: ["connect"],
    });
    f.bus.emit(Events.InteractionCreate, connect);
    await f.dispose();
    expect(f.controls.voice.connect).toHaveBeenCalledWith(
      "999999999999999999",
      f.guild.id,
    );
  });
  it("preserves advanced legacy scopes when opening whitelist and shows the scope accurately", async () => {
    const f = fixture();
    f.store.put(f.guild.id, "whitelist", "legacy", {
      id: "legacy",
      kind: "user",
      subjectId: "223456789012345678",
      actions: ["channel.create"],
    });
    const i = interaction("command", { options: options("list", "whitelist") });
    f.bus.emit(Events.InteractionCreate, i);
    await f.dispose();
    expect(
      f.store.get<WhitelistEntry>(f.guild.id, "whitelist", "legacy")?.actions,
    ).toEqual(["channel.create"]);
    expect(embedDescription(i)).toContain(
      t("tr", "panel.whitelistSelected", { count: 1 }),
    );
  });
});
describe("limit validation", () => {
  it.each([
    ["0", "60"],
    ["1.5", "60"],
    ["NaN", "60"],
    ["10001", "60"],
    ["5", "0"],
    ["5", "86401"],
    ["5", "Infinity"],
    ["-1", "60"],
  ])("rejects invalid %s / %s", (count, seconds) =>
    expect(() => validateLimits(count, seconds)).toThrow(),
  );
  it("accepts supported boundary values", () => {
    expect(validateLimits("1", "1")).toEqual({ threshold: 1, windowMs: 1000 });
    expect(validateLimits("10000", "86400")).toEqual({
      threshold: 10000,
      windowMs: 86400000,
    });
  });
});
