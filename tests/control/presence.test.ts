import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import { ActivityType, Events, type Client } from "discord.js";
import type { Logger } from "pino";
import { SqliteStore } from "../../src/database/index.js";
import { createPresenceManager } from "../../src/control/presence.js";
import {
  botProfile,
  validateBotProfile,
  type BotProfileConfig,
} from "../../src/configuration/bot-profile.js";
import type { OwnerAuthorization } from "../../src/control/contracts.js";
const OWNER = "223456789012345678";
const authorization: OwnerAuthorization = {
  isBotOwner: (id) => id === OWNER,
  assertOwner: (id) => {
    if (id !== OWNER) throw new Error("Denied");
  },
  requireBotOwner: async () => false,
};
function fixture(
  patch: Partial<BotProfileConfig> = {},
  existingDescription: string | null = "Previous application description",
) {
  const store = new SqliteStore(":memory:");
  let ready = true;
  const presence: {
    status: string;
    activities: { type: number; name: string; state?: string }[];
  } = { status: "online", activities: [] };
  const setPresence = vi.fn(
    (payload: { status: string; activities: typeof presence.activities }) => {
      presence.status = payload.status;
      presence.activities = payload.activities;
    },
  );
  const application = {
    description: existingDescription,
    fetch: vi.fn(),
    edit: vi.fn(),
  };
  application.fetch.mockImplementation(async () => application);
  application.edit.mockImplementation(
    async ({ description }: { description: string }) => {
      application.description = description;
      return application;
    },
  );
  const bus = Object.assign(new EventEmitter(), {
    isReady: () => ready,
    user: { setPresence, presence },
    application,
  });
  const profile: BotProfileConfig = { ...botProfile, ...patch },
    logger = { warn: vi.fn(), info: vi.fn() } as unknown as Logger;
  const manager = createPresenceManager(
    bus as unknown as Client,
    store,
    authorization,
    logger,
    profile,
  );
  return {
    store,
    manager,
    logger,
    bus,
    setPresence,
    application,
    profile,
    setReady: (value: boolean) => {
      ready = value;
    },
    close: async () => {
      await manager.dispose();
      store.close();
    },
  };
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
describe("source-only bot profile", () => {
  it.each(["online", "idle", "dnd", "invisible"] as const)(
    "applies configured %s status when ready",
    async (status) => {
      const f = fixture({ status });
      try {
        await f.manager.start();
        expect(f.setPresence).toHaveBeenCalledWith(
          expect.objectContaining({ status }),
        );
        expect(f.manager.getState()).toMatchObject({ status, applied: true });
      } finally {
        await f.close();
      }
    },
  );
  it.each([
    ["playing", ActivityType.Playing],
    ["watching", ActivityType.Watching],
    ["listening", ActivityType.Listening],
    ["competing", ActivityType.Competing],
  ] as const)(
    "uses supported %s activity payload",
    async (activityType, type) => {
      const f = fixture({ activityType, activityText: "Protecting Servers" });
      try {
        await f.manager.start();
        expect(f.setPresence).toHaveBeenCalledWith({
          status: "online",
          activities: [{ name: "Protecting Servers", type }],
        });
      } finally {
        await f.close();
      }
    },
  );
  it("puts custom status text in state and clears activities for none", async () => {
    const custom = fixture({
      activityType: "custom",
      activityText: "Protection active",
    });
    try {
      await custom.manager.start();
      expect(custom.setPresence).toHaveBeenCalledWith({
        status: "online",
        activities: [
          {
            name: "Custom Status",
            type: ActivityType.Custom,
            state: "Protection active",
          },
        ],
      });
      expect(custom.manager.getState().text).toBe("Protection active");
    } finally {
      await custom.close();
    }
    const none = fixture({ activityType: "none", activityText: "" });
    try {
      await none.manager.start();
      expect(none.setPresence).toHaveBeenCalledWith({
        status: "online",
        activities: [],
      });
    } finally {
      await none.close();
    }
  });
  it("ignores obsolete SQLite settings and preserves every existing record", async () => {
    const f = fixture({ status: "dnd", activityText: "From source" });
    try {
      const obsolete = {
        version: 1,
        status: "idle",
        activityType: "playing",
        text: "Old DB text",
      };
      f.store.put("$global", "runtime", "presence", obsolete);
      f.store.put("guild", "runtime", "voice", { channelId: "saved" });
      await f.manager.start();
      expect(f.manager.getConfig()).toMatchObject({
        status: "dnd",
        text: "From source",
        activityType: "custom",
      });
      expect(f.store.get("$global", "runtime", "presence")).toEqual(obsolete);
      expect(f.store.get("guild", "runtime", "voice")).toEqual({
        channelId: "saved",
      });
      expect(f.setPresence).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "idle" }),
      );
    } finally {
      await f.close();
    }
  });
  it("never reads the old database presence configuration", async () => {
    const f = fixture();
    try {
      vi.spyOn(f.store, "get").mockImplementation(() => {
        throw new Error("DB unavailable");
      });
      await f.manager.start();
      expect(f.setPresence).toHaveBeenCalledOnce();
      expect(f.application.edit).toHaveBeenCalledOnce();
    } finally {
      await f.close();
    }
  });
  it("rejects all direct profile mutation, including the owner, without database writes", async () => {
    const f = fixture();
    try {
      await expect(
        f.manager.update(OWNER, { status: "dnd" }),
      ).rejects.toMatchObject({ key: "profile.codeOnly" });
      await expect(f.manager.reset(OWNER)).rejects.toMatchObject({
        key: "profile.codeOnly",
      });
      await expect(
        f.manager.update("other", { status: "idle" }),
      ).rejects.toThrow("Denied");
      expect(f.store.list("$global", "runtime")).toEqual([]);
      expect(f.setPresence).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
  it("validates description limit, activity text and supported statuses before effects", async () => {
    expect(() =>
      validateBotProfile({ ...botProfile, aboutMe: "x".repeat(400) }),
    ).not.toThrow();
    expect(() =>
      validateBotProfile({ ...botProfile, aboutMe: "x".repeat(401) }),
    ).toThrow();
    expect(() =>
      validateBotProfile({ ...botProfile, status: "offline" }),
    ).toThrow();
    expect(() =>
      validateBotProfile({ ...botProfile, activityType: "streaming" }),
    ).toThrow();
    expect(() =>
      validateBotProfile({ ...botProfile, activityText: "\n" }),
    ).toThrow();
    expect(() =>
      validateBotProfile({ ...botProfile, activityText: " " }),
    ).toThrow();
    const f = fixture({ aboutMe: "x".repeat(401) });
    try {
      await f.manager.start();
      expect(f.setPresence).not.toHaveBeenCalled();
      expect(f.application.fetch).not.toHaveBeenCalled();
      expect(f.logger.warn).toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
  it("fetches and synchronizes only application description using official edit options", async () => {
    const f = fixture({
      aboutMe:
        "Ultimate Guard | Professional Discord Protection. Developed by Casi.",
    });
    try {
      await f.manager.start();
      expect(f.application.fetch).toHaveBeenCalledOnce();
      expect(f.application.edit).toHaveBeenCalledWith({
        description: f.profile.aboutMe,
      });
      expect(f.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("synchronized"),
      );
    } finally {
      await f.close();
    }
  });
  it("does not update an unchanged application description", async () => {
    const f = fixture({}, botProfile.aboutMe);
    try {
      await f.manager.start();
      expect(f.application.fetch).toHaveBeenCalledOnce();
      expect(f.application.edit).not.toHaveBeenCalled();
      expect(f.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("unchanged"),
      );
    } finally {
      await f.close();
    }
  });
  it("does not send an unnecessary empty-description edit when Discord reports null", async () => {
    const f = fixture({ aboutMe: "" }, null);
    try {
      await f.manager.start();
      expect(f.application.edit).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
  it("allows manual Developer Portal management when synchronization is disabled", async () => {
    const f = fixture({ syncAboutMeOnStartup: false });
    try {
      await f.manager.start();
      expect(f.application.fetch).not.toHaveBeenCalled();
      expect(f.application.edit).not.toHaveBeenCalled();
      expect(f.setPresence).toHaveBeenCalledOnce();
      expect(f.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Developer Portal"),
      );
    } finally {
      await f.close();
    }
  });
  it("contains edit failures without claiming success and gives a supported manual fallback", async () => {
    const f = fixture();
    try {
      f.application.edit.mockRejectedValue(
        new Error("Missing application permission"),
      );
      await expect(f.manager.start()).resolves.toBeUndefined();
      expect(f.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining("Manual fallback"),
      );
      expect(f.logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("synchronized"),
      );
      expect(f.manager.getState().applied).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("does not repeat application edits on repeated starts or ready events and has no update interval", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.manager.start();
      await f.manager.start();
      f.bus.emit(Events.ClientReady);
      f.bus.emit(Events.ClientReady);
      await flush();
      await vi.advanceTimersByTimeAsync(600000);
      expect(f.application.edit).toHaveBeenCalledOnce();
      expect(f.application.fetch).toHaveBeenCalledOnce();
      expect(f.setPresence).toHaveBeenCalledTimes(3);
    } finally {
      await f.close();
      vi.useRealTimers();
    }
  });
  it("waits for readiness and applies source configuration again after a manager restart", async () => {
    const f = fixture({
      status: "idle",
      activityText: "From source after restart",
    });
    try {
      f.setReady(false);
      await f.manager.start();
      expect(f.setPresence).not.toHaveBeenCalled();
      f.setReady(true);
      f.bus.emit(Events.ClientReady);
      await flush();
      expect(f.setPresence).toHaveBeenCalledOnce();
      await f.manager.dispose();
      const next = createPresenceManager(
        f.bus as unknown as Client,
        f.store,
        authorization,
        f.logger,
        { ...f.profile, status: "dnd" },
      );
      await next.start();
      expect(f.setPresence).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "dnd" }),
      );
      await next.dispose();
    } finally {
      f.store.close();
    }
  });
  it("does not edit an application after disposal while fetch is outstanding", async () => {
    const f = fixture();
    let release!: (value: typeof f.application) => void;
    f.application.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const started = f.manager.start();
    await flush();
    const disposing = f.manager.dispose();
    release(f.application);
    await started;
    await disposing;
    expect(f.application.edit).not.toHaveBeenCalled();
    f.store.close();
  });
});
