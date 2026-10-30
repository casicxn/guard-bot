import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  Events,
  ChannelType,
  GatewayIntentBits,
  IntentsBitField,
  MessageFlags,
  type Client,
  type Interaction,
} from "discord.js";
import type { Logger } from "pino";
import type { BackupService } from "../../src/contracts.js";
import { SqliteStore } from "../../src/database/index.js";
import { AuthorizationService } from "../../src/control/authorization.js";
import { installDiscord } from "../../src/discord/index.js";
import { Sessions } from "../../src/discord/sessions.js";
import { createPanels } from "../../src/discord/panels.js";
import {
  createPermanentPanel,
  type PermanentPanelRecord,
} from "../../src/discord/permanent-panel.js";
import { testControls } from "../helpers/controls.js";
import { publishChange } from "../../src/change-events.js";
const GUILD = "123456789012345678",
  CHANNEL = "223456789012345678",
  SECOND = "323456789012345678",
  OWNER = "999999999999999999",
  BOT = "423456789012345678";
type Payload = {
  embeds?: {
    title?: string;
    description?: string;
    footer?: { text: string };
  }[];
  components?: {
    components: { custom_id?: string; label?: string; options?: unknown[] }[];
  }[];
  flags?: number;
  content?: string;
};
interface FakeMessage {
  id: string;
  guildId: string;
  channelId: string;
  author: { id: string };
  pinned: boolean;
  payload: Payload;
  edit: ReturnType<typeof vi.fn>;
  pin: ReturnType<typeof vi.fn>;
}
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.useRealTimers();
});
function fixture(path = ":memory:") {
  const store = new SqliteStore(path),
    messages = new Map<string, FakeMessage>();
  let next = 523456789012345678n,
    permissions = true,
    pinAllowed = true;
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
  const channel = (id: string) => ({
    id,
    guildId: GUILD,
    type: ChannelType.GuildText,
    guild: undefined as unknown,
    permissionsFor: () => ({
      has: (bits: bigint | bigint[]) =>
        Array.isArray(bits) ? permissions : pinAllowed,
    }),
    messages: {
      fetch: vi.fn(async (input: { message: string }) => {
        const message = messages.get(input.message);
        if (!message || message.channelId !== id) throw { code: 10008 };
        return message;
      }),
    },
    send: vi.fn(async (payload: Payload) => {
      const message: FakeMessage = {
        id: String(next++),
        guildId: GUILD,
        channelId: id,
        author: { id: BOT },
        pinned: false,
        payload: JSON.parse(JSON.stringify(payload)) as Payload,
        edit: vi.fn(),
        pin: vi.fn(),
      };
      message.edit.mockImplementation(async (value: Payload) => {
        message.payload = JSON.parse(JSON.stringify(value)) as Payload;
        return message;
      });
      message.pin.mockImplementation(async () => {
        message.pinned = true;
      });
      messages.set(message.id, message);
      return message;
    }),
  });
  const first = channel(CHANNEL),
    second = channel(SECOND),
    channels = new Map([
      [CHANNEL, first],
      [SECOND, second],
    ]);
  const guild = {
    id: GUILD,
    name: "Example Guild",
    members: {
      fetchMe: vi.fn(async () => ({
        permissions: { has: () => true },
        roles: { highest: { name: "Guard" } },
      })),
      fetch: vi.fn(async ({ user }: { user: string }) => ({
        id: user,
        guild: { id: GUILD },
        user: { bot: false },
      })),
    },
    roles: { fetch: vi.fn(async () => new Map()) },
    channels: {
      fetch: vi.fn(async (id?: string) =>
        id ? (channels.get(id) ?? null) : channels,
      ),
    },
  };
  first.guild = guild;
  second.guild = guild;
  const bus = Object.assign(new EventEmitter(), {
    user: { id: BOT },
    guilds: {
      cache: new Map([[GUILD, guild]]),
      fetch: vi.fn(async () => guild),
    },
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
    isReady: () => true,
    uptime: 1000,
    ws: { ping: 10 },
  });
  const controls = testControls();
  controls.ownerId = OWNER;
  controls.authorization = new AuthorizationService(OWNER, store, logger);
  const backup = {
    list: () => [],
    create: vi.fn(async () => ({ id: "backup" })),
    preview: vi.fn(),
    restore: vi.fn(),
  } as unknown as BackupService;
  let dispose: () => Promise<void> = async () => {};
  const install = () => {
    dispose = installDiscord(
      bus as unknown as Client,
      store,
      { process: async () => undefined },
      backup,
      logger,
      controls,
    );
    return dispose;
  };
  install();
  const record = () =>
    store.get<PermanentPanelRecord>(GUILD, "permanent_panel", "main")!;
  const message = () => messages.get(record().panelMessageId)!;
  const interaction = (
    kind = "command",
    extra: Record<string, unknown> = {},
  ) => {
    const value = {
      guildId: GUILD,
      channelId: CHANNEL,
      client: bus,
      user: { id: OWNER },
      commandName: "guard",
      customId: "",
      deferred: false,
      replied: false,
      message: record() ? message() : undefined,
      options: { getSubcommand: () => "panel", getSubcommandGroup: () => null },
      values: [] as string[],
      isChatInputCommand: () => kind === "command",
      isMessageComponent: () => ["button", "select", "channel"].includes(kind),
      isModalSubmit: () => kind === "modal",
      isButton: () => kind === "button",
      isStringSelectMenu: () => kind === "select",
      isUserSelectMenu: () => false,
      isRoleSelectMenu: () => false,
      isChannelSelectMenu: () => kind === "channel",
      isFromMessage: () => true,
      reply: vi.fn(async (_payload?: unknown) => {
        value.replied = true;
      }),
      deferReply: vi.fn(async (_payload?: unknown) => {
        value.deferred = true;
      }),
      deferUpdate: vi.fn(async () => {
        value.deferred = true;
      }),
      editReply: vi.fn(async (_payload?: unknown) => undefined),
      followUp: vi.fn(async (_payload?: unknown) => undefined),
      showModal: vi.fn(async (_payload?: unknown) => {
        value.replied = true;
      }),
      ...extra,
    };
    return value;
  };
  const send = async (value: ReturnType<typeof interaction>) => {
    bus.emit(Events.InteractionCreate, value as unknown as Interaction);
    await flush();
    return value;
  };
  const manager = (sessions = new Sessions()) => {
    return createPermanentPanel(
      bus as unknown as Client,
      store,
      logger,
      sessions,
      controls,
      createPanels(
        bus as unknown as Client,
        store,
        backup,
        sessions,
        logger,
        controls,
      ),
    );
  };
  let closed = false;
  cleanup.push(async () => {
    if (!closed) {
      await dispose();
      store.close();
      closed = true;
    }
  });
  return {
    store,
    bus,
    guild,
    first,
    second,
    channels,
    messages,
    controls,
    logger,
    backup,
    record,
    message,
    interaction,
    send,
    manager,
    install,
    stop: async () => dispose(),
    close: async () => {
      await dispose();
      store.close();
      closed = true;
    },
    setPermissions: (value: boolean) => {
      permissions = value;
    },
    setPin: (value: boolean) => {
      pinAllowed = value;
    },
  };
}
async function flush() {
  for (let index = 0; index < 250; index++) await Promise.resolve();
}
const findId = (payload: Payload, operation: string) =>
  (JSON.parse(JSON.stringify(payload)) as Payload).components
    ?.flatMap((row) => row.components)
    .find((component) => component.custom_id?.includes(`:${operation}`))
    ?.custom_id;
describe("production permanent panel routing", () => {
  it("creates only a canonical panel for the first ordinary command and acknowledges once", async () => {
    const f = fixture();
    const command = await f.send(
      f.interaction("command", {
        options: {
          getSubcommand: () => "modules",
          getSubcommandGroup: () => null,
          getInteger: () => null,
        },
      }),
    );
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(command.deferReply).toHaveBeenCalledOnce();
    expect(command.reply).not.toHaveBeenCalled();
    expect(f.record().view?.section).toBe("modules");
    expect(
      (command.editReply.mock.calls.at(-1)?.[0] as Payload).components,
    ).toEqual([]);
  });
  it("acknowledges malformed saved panel records with a private error", async () => {
    const f = fixture();
    f.store.put(GUILD, "permanent_panel", "main", { invalid: true });
    const command = await f.send(
      f.interaction("command", {
        options: {
          getSubcommand: () => "modules",
          getSubcommandGroup: () => null,
          getInteger: () => null,
        },
      }),
    );
    expect(command.reply).toHaveBeenCalledOnce();
    expect((command.reply.mock.calls[0]?.[0] as Payload).flags).toBe(
      MessageFlags.Ephemeral,
    );
    expect(f.first.send).not.toHaveBeenCalled();
  });

  it("routes ordinary slash navigation back to the canonical message without private panel copies", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const original = f.record().panelMessageId;
    for (const sub of ["modules", "limits", "status", "modules"]) {
      const command = await f.send(
        f.interaction("command", {
          options: {
            getSubcommand: () => sub,
            getSubcommandGroup: () => null,
            getInteger: () => null,
          },
        }),
      );
      const ack = command.editReply.mock.calls.at(-1)?.[0] as Payload;
      expect(ack.components).toEqual([]);
      expect(JSON.stringify(ack)).toContain(original);
      expect(command.deferReply).toHaveBeenCalledOnce();
      expect(command.followUp).not.toHaveBeenCalled();
    }
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(f.record().panelMessageId).toBe(original);
  });
  it("keeps ordinary selectors reusable through repeated navigation and Back/Main/Refresh", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const original = f.record().panelMessageId;
    for (const section of [
      "modules",
      "modules",
      "limits",
      "voice",
      "modules",
    ]) {
      const click = await f.send(
        f.interaction("select", {
          customId: "ug:v1:panel:section",
          values: [section],
        }),
      );
      expect(click.deferUpdate).toHaveBeenCalledOnce();
      expect(click.followUp).not.toHaveBeenCalled();
      expect(f.record().view?.section).toBe(section);
    }
    for (const operation of ["refresh", "back", "main", "refresh"]) {
      const click = await f.send(
        f.interaction("button", { customId: "ug:v1:panel:" + operation }),
      );
      expect(click.deferUpdate).toHaveBeenCalledOnce();
      expect(click.followUp).not.toHaveBeenCalled();
    }
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(f.record().panelMessageId).toBe(original);
  });
  it("preserves private whitelist return controls and fresh selectors after mutations", async () => {
    const f = fixture();
    await f.send(f.interaction());
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["whitelist"],
      }),
    );
    const open = await f.send(
      f.interaction("button", { customId: "ug:v1:panel:private-open" }),
    );
    let privatePayload = open.followUp.mock.calls.at(-1)?.[0] as Payload;
    const roleId = "623456789012345678";
    f.guild.roles.fetch.mockResolvedValue(
      new Map([[roleId, { id: roleId, guild: { id: GUILD } }]]),
    );
    for (const [subject, kind] of [
      [SECOND, "user"],
      [CHANNEL, "user"],
      [roleId, "role"],
    ]) {
      const trust = await f.send(
        f.interaction("select", {
          customId: findId(
            privatePayload,
            kind === "role" ? "trust-role" : "trust-user",
          ),
          values: [subject],
          isUserSelectMenu: () => kind === "user",
          isRoleSelectMenu: () => kind === "role",
        }),
      );
      const result = trust.editReply.mock.calls.at(-1)?.[0] as Payload;
      expect(trust.deferUpdate).toHaveBeenCalledOnce();
      expect(trust.deferReply).not.toHaveBeenCalled();
      expect(trust.followUp).not.toHaveBeenCalled();
      expect(findId(result, "back")).toBeTruthy();
      const back = await f.send(
        f.interaction("button", { customId: findId(result, "back") }),
      );
      privatePayload = back.editReply.mock.calls.at(-1)?.[0] as Payload;
      expect(back.deferUpdate).toHaveBeenCalledOnce();
      expect(back.deferReply).not.toHaveBeenCalled();
      expect(findId(privatePayload, "trust-user")).toBeTruthy();
      expect(findId(privatePayload, "trust-role")).toBeTruthy();
    }
    const main = await f.send(
      f.interaction("button", { customId: findId(privatePayload, "main") }),
    );
    expect(
      (main.editReply.mock.calls.at(-1)?.[0] as Payload).components,
    ).toEqual([]);
    expect(f.record().view?.section).toBe("overview");
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(f.store.list(GUILD, "whitelist")).toHaveLength(3);
  });
  it("shows restart state publicly but snapshots privately and requires activation confirmation", async () => {
    const f = fixture();
    const session = {
      version: 1 as const,
      id: "restart-session",
      guildId: GUILD,
      initiatedBy: OWNER,
      createdAt: 1,
      updatedAt: 1,
      originalMode: "protect" as const,
      state: "SNAPSHOTTING" as const,
      canActivate: true,
      risks: ["owner-unrestricted"],
      transitions: [{ state: "SNAPSHOTTING" as const, at: 1 }],
      roles: [
        {
          roleId: SECOND,
          name: "Private role",
          originalPermissions: "24",
          removedPermissions: "8",
          lockedPermissions: "16",
          position: 1,
          manageable: true,
          status: "planned" as const,
        },
      ],
    };
    f.controls.restart = {
      get: () => session,
      prepare: vi.fn(async () => session),
      activate: vi.fn(async () => session),
      restore: vi.fn(async () => session),
      cancel: vi.fn(async () => session),
      recover: vi.fn(async () => session),
      drain: async () => {},
    };
    await f.send(f.interaction());
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["restart"],
      }),
    );
    expect(JSON.stringify(f.message().payload)).not.toContain("Private role");
    const prepare = await f.send(
      f.interaction("button", { customId: "ug:v1:panel:restart-prepare" }),
    );
    expect(prepare.deferUpdate).toHaveBeenCalledOnce();
    expect(f.controls.restart.prepare).toHaveBeenCalledWith(OWNER, GUILD);
    const details = await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:restart-detail",
        values: ["snapshot"],
      }),
    );
    expect(JSON.stringify(details.followUp.mock.calls)).toContain(
      "Private role",
    );
    expect(JSON.stringify(f.message().payload)).not.toContain("Private role");
    const activate = await f.send(
      f.interaction("button", { customId: "ug:v1:panel:restart-activate" }),
    );
    expect(f.controls.restart.activate).not.toHaveBeenCalled();
    const confirmation = activate.followUp.mock.calls.at(-1)?.[0] as Payload;
    await f.send(
      f.interaction("button", { customId: findId(confirmation, "confirm") }),
    );
    expect(f.controls.restart.activate).toHaveBeenCalledWith(
      OWNER,
      GUILD,
      "restart-session",
    );
    expect(f.first.send).toHaveBeenCalledOnce();
  });
  it("keeps ordinary panel controls available when a restart journal needs manual review", async () => {
    const f = fixture();
    f.controls.restart = {
      get: () => {
        throw new Error("Invalid restart journal");
      },
      prepare: async () => { throw new Error("Invalid restart journal"); },
      activate: async () => { throw new Error("Invalid restart journal"); },
      restore: async () => { throw new Error("Invalid restart journal"); },
      cancel: async () => { throw new Error("Invalid restart journal"); },
      recover: async () => undefined,
      drain: async () => undefined,
    };
    await f.send(f.interaction());
    expect(f.record().status).toBe("ready");
    expect(JSON.stringify(f.message().payload)).toContain(
      "Manuel kurtarma gerekiyor",
    );
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["voice"],
      }),
    );
    expect(f.record().view?.section).toBe("voice");
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["restart"],
      }),
    );
    expect(f.record().status).toBe("ready");
    expect(f.first.send).toHaveBeenCalledOnce();
  });
  it("rejects obsolete slow publications after a newer view was requested", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const sessions = new Sessions();
    const permanent = f.manager(sessions);
    const old = permanent.issueRevision(GUILD);
    const newest = permanent.issueRevision(GUILD);
    const render = createPanels(
      f.bus as unknown as Client,
      f.store,
      f.backup,
      sessions,
      f.logger,
      f.controls,
    );
    await permanent.publish(
      OWNER,
      GUILD,
      await render(
        f.guild as unknown as import("discord.js").Guild,
        OWNER,
        "voice",
      ),
      newest,
    );
    await permanent.publish(
      OWNER,
      GUILD,
      await render(
        f.guild as unknown as import("discord.js").Guild,
        OWNER,
        "modules",
      ),
      old,
    );
    expect(f.record().view?.section).toBe("voice");
    await permanent.dispose();
  });

  it("shows a stale private confirmation as an error instead of reporting false success", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const click = await f.send(
      f.interaction("button", { customId: "ug:v1:panel:global-protection" }),
    );
    const payload = click.followUp.mock.calls[0]?.[0] as Payload,
      config = f.store.getConfig(GUILD);
    config.backupRetention++;
    f.store.setConfig(GUILD, config);
    const confirm = await f.send(
      f.interaction("button", { customId: findId(payload, "confirm") }),
    );
    expect(f.store.getConfig(GUILD).mode).toBe("monitor");
    expect(JSON.stringify(confirm.editReply.mock.calls)).toContain(
      String(0xe74c3c),
    );
  });
  it("counts unique non-expired trusted principals and keeps incident identities off the public overview", async () => {
    const f = fixture();
    for (const [id, subjectId, expiresAt] of [
      ["one", "623456789012345678", undefined],
      ["two", "623456789012345678", undefined],
      ["expired", "723456789012345678", Date.now() - 1],
    ] as const)
      f.store.put(GUILD, "whitelist", id, {
        id,
        kind: "user",
        subjectId,
        expiresAt,
        actions: ["role.update"],
      });
    f.store.put(GUILD, "incidents", "case", {
      id: "case",
      guildId: GUILD,
      createdAt: Date.now(),
      confidence: "confirmed",
      status: "handled",
      event: {
        action: "role.delete",
        executorId: "823456789012345678",
        severity: "critical",
      },
    });
    await f.send(f.interaction());
    const text = f.message().payload.embeds?.[0]?.description;
    expect(text).toContain("Whitelist kullanıcı/bot: **1**");
    expect(text).not.toContain("823456789012345678");
    expect(text).not.toContain("623456789012345678");
  });
  it("rejects a stale contextual control after the selected protection changed", async () => {
    const f = fixture();
    await f.send(f.interaction());
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["modules"],
      }),
    );
    const oldToggle = findId(f.message().payload, "toggle")!,
      select = findId(f.message().payload, "module")!;
    await f.send(
      f.interaction("select", { customId: select, values: ["role.delete"] }),
    );
    const before = JSON.stringify(f.store.getConfig(GUILD));
    const stale = await f.send(
      f.interaction("button", { customId: oldToggle }),
    );
    expect(stale.reply).toHaveBeenCalled();
    expect(JSON.stringify(f.store.getConfig(GUILD))).toBe(before);
  });
  it("rechecks ownership in direct panel service operations before any network write", async () => {
    const f = fixture(),
      manager = f.manager();
    await expect(manager.ensure("other", GUILD, CHANNEL)).rejects.toMatchObject(
      { key: "error.owner" },
    );
    await expect(manager.pin("other", GUILD)).rejects.toMatchObject({
      key: "error.owner",
    });
    await expect(
      manager.move("other", GUILD, SECOND, "523456789012345678"),
    ).rejects.toMatchObject({ key: "error.owner" });
    expect(f.first.send).not.toHaveBeenCalled();
    await manager.dispose();
  });
  it("updates language on the existing message through native public settings", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const id = f.record().panelMessageId;
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["settings"],
      }),
    );
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:language",
        values: ["en"],
      }),
    );
    expect(f.store.getConfig(GUILD).language).toBe("en");
    expect(f.record().panelLanguage).toBe("en");
    expect(f.record().panelMessageId).toBe(id);
    expect(JSON.stringify(f.message().payload)).toContain("Language: English");
  });
  it("gracefully reports a pin permission loss returned by Discord", async () => {
    const f = fixture();
    await f.send(f.interaction());
    f.message().pin.mockRejectedValueOnce({ code: 50013 });
    const i = await f.send(
      f.interaction("button", { customId: "ug:v1:panel:panel-pin" }),
    );
    expect(JSON.stringify(i.followUp.mock.calls)).toContain("Sabitleme");
    expect(f.record().status).toBe("ready");
  });
  it("allows a definite permission rejection to be retried without creating an uncertainty loop", async () => {
    const f = fixture();
    f.first.send.mockRejectedValueOnce({ code: 50013 });
    await f.send(f.interaction());
    expect(f.store.get(GUILD, "panel_creation", "main")).toBeUndefined();
    await f.send(f.interaction());
    expect(f.record().status).toBe("ready");
    expect(f.first.send).toHaveBeenCalledTimes(2);
  });
  it("sends a normal channel message, stores its reference and only privately acknowledges the command", async () => {
    const f = fixture(),
      i = await f.send(f.interaction());
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(f.message().payload.flags).toBeUndefined();
    expect(f.record()).toMatchObject({
      panelChannelId: CHANNEL,
      panelEnabled: true,
      panelLanguage: "tr",
      status: "ready",
    });
    expect(f.message().payload.embeds?.[0]?.title).toContain("ULTIMATE GUARD");
    expect(f.message().payload.embeds?.[0]?.footer?.text).toContain("Casi");
    expect(i.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(JSON.stringify(i.editReply.mock.calls)).toContain(
      f.record().panelMessageId,
    );
    expect(findId(f.message().payload, "global-protection")).toBe(
      "ug:v1:panel:global-protection",
    );
  });
  it("coalesces simultaneous install commands and reuses the same message in another command channel", async () => {
    const f = fixture();
    await Promise.all([f.send(f.interaction()), f.send(f.interaction())]);
    const id = f.record().panelMessageId;
    await f.send(f.interaction("command", { channelId: SECOND }));
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(f.second.send).not.toHaveBeenCalled();
    expect(f.record().panelMessageId).toBe(id);
  });
  it("edits the registered message for public navigation after a simulated process restart", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const id = f.record().panelMessageId;
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["presence"],
      }),
    );
    expect(f.record().view?.section).toBe("presence");
    await f.stop();
    f.install();
    await flush();
    expect(f.record().panelMessageId).toBe(id);
    expect(f.record().view?.section).toBe("overview");
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["settings"],
      }),
    );
    expect(f.record().view?.section).toBe("settings");
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.message().payload)).not.toContain("guard:section:");
  });
  it("denies administrators and whitelist members without acknowledging or modifying the public message", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const edits = f.message().edit.mock.calls.length;
    f.store.put(GUILD, "whitelist", "other", {
      kind: "user",
      subjectId: "623456789012345678",
      actions: ["*"],
    });
    const i = await f.send(
      f.interaction("button", {
        customId: "ug:v1:panel:global-protection",
        user: { id: "623456789012345678" },
        memberPermissions: { has: () => true },
      }),
    );
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
    expect(i.deferUpdate).not.toHaveBeenCalled();
    expect(f.message().edit).toHaveBeenCalledTimes(edits);
    expect(f.store.getConfig(GUILD).mode).toBe("monitor");
  });
  it.each(["wrong-message", "wrong-channel", "wrong-author", "old-version"])(
    "rejects %s controls without public changes",
    async (reason) => {
      const f = fixture();
      await f.send(f.interaction());
      const before = f.message().edit.mock.calls.length;
      const patch =
        reason === "wrong-message"
          ? { message: { ...f.message(), id: "723456789012345678" } }
          : reason === "wrong-channel"
            ? { channelId: SECOND }
            : reason === "wrong-author"
              ? { message: { ...f.message(), author: { id: "other" } } }
              : { customId: "ug:v0:panel:main" };
      const i = await f.send(
        f.interaction("button", { customId: "ug:v1:panel:main", ...patch }),
      );
      expect(i.reply).toHaveBeenCalled();
      expect(f.message().edit).toHaveBeenCalledTimes(before);
    },
  );
  it("requires private confirmation and uses the actual global protection service without replacing the message", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const id = f.record().panelMessageId;
    const click = await f.send(
      f.interaction("button", { customId: "ug:v1:panel:global-protection" }),
    );
    expect(f.store.getConfig(GUILD).mode).toBe("monitor");
    const payload = click.followUp.mock.calls.at(-1)?.[0] as unknown as Payload;
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    const confirm = findId(payload, "confirm")!;
    await f.send(
      f.interaction("button", {
        customId: confirm,
        message: { ...f.message(), id: "823456789012345678" },
      }),
    );
    expect(f.store.getConfig(GUILD)).toMatchObject({
      mode: "protect",
      zeroTolerance: true,
    });
    expect(f.record().panelMessageId).toBe(id);
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(findId(f.message().payload, "global-protection")).toBe(
      "ug:v1:panel:global-protection",
    );
  });
  it.each(["select", "button"])(
    "opens the voice ID modal immediately from %s and keeps it private",
    async (kind) => {
      const f = fixture();
      await f.send(f.interaction());
      await f.send(
        f.interaction("select", {
          customId: "ug:v1:panel:section",
          values: ["presence"],
        }),
      );
      expect(JSON.stringify(f.message().payload)).not.toContain(
        "ug:v1:panel:presence-text",
      );
      const obsolete = await f.send(
        f.interaction("button", { customId: "ug:v1:panel:presence-text" }),
      );
      expect(obsolete.showModal).not.toHaveBeenCalled();
      await f.send(
        f.interaction("select", {
          customId: "ug:v1:panel:section",
          values: ["voice"],
        }),
      );
      expect(findId(f.message().payload, "voice-id")).toBe(
        "ug:v1:panel:voice-id",
      );
      const click = await f.send(
        f.interaction(kind, {
          customId:
            kind === "button"
              ? "ug:v1:panel:voice-id"
              : "ug:v1:panel:voice-action",
          values: ["id"],
        }),
      );
      expect(click.showModal).toHaveBeenCalled();
      expect(click.deferUpdate).not.toHaveBeenCalled();
      const modal = JSON.parse(
        JSON.stringify(click.showModal.mock.calls[0]?.[0]),
      ) as { custom_id: string };
      f.controls.voice.configure = vi.fn(async (_actor, guildId, patch) => ({
        ...f.controls.voice.getConfig(guildId),
        ...patch,
      }));
      const submit = await f.send(
        f.interaction("modal", {
          customId: modal.custom_id,
          fields: { getTextInputValue: () => SECOND },
        }),
      );
      expect(f.controls.voice.configure).toHaveBeenCalledWith(OWNER, GUILD, {
        channelId: SECOND,
      });
      expect(submit.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral,
      });
      expect(f.record().view?.section).toBe("voice");
    },
  );
  it("saves a native voice-channel selection through the registered public panel", async () => {
    const f = fixture();
    await f.send(f.interaction());
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["voice"],
      }),
    );
    f.controls.voice.configure = vi.fn(async (_actor, guildId, patch) => ({
      ...f.controls.voice.getConfig(guildId),
      ...patch,
    }));
    const selection = await f.send(
      f.interaction("channel", {
        customId: "ug:v1:panel:voice-channel",
        values: [SECOND],
      }),
    );
    expect(selection.deferUpdate).toHaveBeenCalledOnce();
    expect(f.controls.voice.configure).toHaveBeenCalledWith(OWNER, GUILD, {
      channelId: SECOND,
    });
    expect(f.record().view?.section).toBe("voice");
    expect(selection.followUp).not.toHaveBeenCalled();
  });
  it("shows only aggregate public records and opens sensitive details privately", async () => {
    const f = fixture();
    f.store.put(GUILD, "whitelist", "entry", {
      id: "entry",
      kind: "user",
      subjectId: "923456789012345678",
      actions: ["*"],
    });
    await f.send(f.interaction());
    await f.send(
      f.interaction("select", {
        customId: "ug:v1:panel:section",
        values: ["whitelist"],
      }),
    );
    expect(JSON.stringify(f.message().payload)).not.toContain(
      "923456789012345678",
    );
    const i = await f.send(
      f.interaction("button", { customId: "ug:v1:panel:private-open" }),
    );
    const payload = i.followUp.mock.calls[0]?.[0] as unknown as Payload;
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    expect(JSON.stringify(payload)).toContain("923456789012345678");
    expect(f.record().view?.section).toBe("whitelist");
  });
  it("recreates a deleted message only on the owner command, not from event refresh", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const old = f.record().panelMessageId;
    f.messages.delete(old);
    await f.stop();
    f.install();
    await flush();
    expect(f.record().status).toBe("unavailable");
    expect(f.first.send).toHaveBeenCalledOnce();
    await f.send(f.interaction());
    expect(f.record().panelMessageId).not.toBe(old);
    expect(f.first.send).toHaveBeenCalledTimes(2);
  });
  it("recreates a deleted saved channel in the explicit owner destination", async () => {
    const f = fixture();
    await f.send(f.interaction());
    f.channels.delete(CHANNEL);
    await f.send(f.interaction("command", { channelId: SECOND }));
    expect(f.record().panelChannelId).toBe(SECOND);
    expect(f.second.send).toHaveBeenCalledOnce();
  });
  it("does not replace a message belonging to another author", async () => {
    const f = fixture();
    await f.send(f.interaction());
    f.message().author.id = "other";
    const i = await f.send(f.interaction());
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(i.followUp).toHaveBeenCalled();
  });
  it("reports missing channel permissions and never saves a fictitious panel", async () => {
    const f = fixture();
    f.setPermissions(false);
    const i = await f.send(f.interaction());
    expect(f.first.send).not.toHaveBeenCalled();
    expect(f.record()).toBeUndefined();
    expect(i.followUp).toHaveBeenCalled();
  });
  it("pins once and keeps the panel working when pin permissions are missing", async () => {
    const f = fixture();
    await f.send(f.interaction());
    f.setPin(false);
    await f.send(
      f.interaction("button", { customId: "ug:v1:panel:panel-pin" }),
    );
    expect(f.message().pin).not.toHaveBeenCalled();
    f.setPin(true);
    await f.send(
      f.interaction("button", { customId: "ug:v1:panel:panel-pin" }),
    );
    await f.send(
      f.interaction("button", { customId: "ug:v1:panel:panel-pin" }),
    );
    expect(f.message().pin).toHaveBeenCalledOnce();
  });
  it("moves only with confirmation and retires the previous controls", async () => {
    const f = fixture();
    await f.send(f.interaction());
    const old = f.message();
    const choose = await f.send(
      f.interaction("channel", {
        customId: "ug:v1:panel:panel-move",
        values: [SECOND],
      }),
    );
    expect(f.second.send).not.toHaveBeenCalled();
    const payload = choose.followUp.mock.calls[0]?.[0] as unknown as Payload;
    await f.send(
      f.interaction("button", { customId: findId(payload, "confirm") }),
    );
    expect(f.record().panelChannelId).toBe(SECOND);
    expect(f.second.send).toHaveBeenCalledOnce();
    expect(old.payload.components).toEqual([]);
    const stale = await f.send(
      f.interaction("button", { message: old, customId: "ug:v1:panel:main" }),
    );
    expect(stale.reply).toHaveBeenCalled();
  });
  it.each(["tr", "en"] as const)(
    "updates the same public panel in %s",
    async (language) => {
      const f = fixture();
      const config = f.store.getConfig(GUILD);
      config.language = language;
      f.store.setConfig(GUILD, config);
      await f.send(f.interaction());
      expect(f.record().panelLanguage).toBe(language);
      expect(f.message().payload.embeds?.[0]?.title).toContain(
        language === "tr" ? "Güvenlik" : "Security",
      );
      expect(f.message().payload.embeds?.[0]?.footer?.text).toContain(
        language === "tr" ? "tarafından" : "Developed",
      );
    },
  );
  it("coalesces store events, skips unchanged edits and isolates API failures", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.send(f.interaction());
    const message = f.message(),
      before = message.edit.mock.calls.length;
    for (let i = 0; i < 10; i++) publishChange(f.store, GUILD, "config");
    await vi.advanceTimersByTimeAsync(1600);
    await flush();
    expect(message.edit).toHaveBeenCalledTimes(before);
    const config = f.store.getConfig(GUILD);
    config.language = "en";
    f.store.setConfig(GUILD, config);
    await vi.advanceTimersByTimeAsync(1600);
    await flush();
    expect(message.edit).toHaveBeenCalledTimes(before + 1);
    expect(f.record().panelLanguage).toBe("en");
    message.edit.mockRejectedValueOnce(new Error("Discord unavailable"));
    expect(() => publishChange(f.store, GUILD, "voice_state")).not.toThrow();
    f.store.setConfig(GUILD, { ...config, language: "tr" });
    await vi.advanceTimersByTimeAsync(1600);
    await flush();
    expect(f.logger.warn).toHaveBeenCalled();
    expect(f.store.getConfig(GUILD).language).toBe("tr");
  });
  it("does not duplicate a send whose API outcome is uncertain", async () => {
    const f = fixture();
    f.first.send.mockRejectedValueOnce(new Error("Connection lost after send"));
    await f.send(f.interaction());
    await f.send(f.interaction());
    expect(f.first.send).toHaveBeenCalledOnce();
    expect(f.store.get(GUILD, "panel_creation", "main")).toMatchObject({
      state: "pending",
    });
  });
  it("persists panel references across closing and reopening the SQLite file without changing existing data", async () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-panel-")),
      file = join(dir, "guard.sqlite");
    const f = fixture(file);
    await f.send(f.interaction());
    const saved = f.record();
    f.store.put(GUILD, "whitelist", "legacy", { actions: ["role.update"] });
    await f.close();
    const reopened = new SqliteStore(file);
    try {
      expect(reopened.get(GUILD, "permanent_panel", "main")).toEqual(saved);
      expect(reopened.get(GUILD, "whitelist", "legacy")).toEqual({
        actions: ["role.update"],
      });
    } finally {
      reopened.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
