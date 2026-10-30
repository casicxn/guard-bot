import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../../src/database/index.js";
import { languageFor } from "../../src/locales/index.js";
import { createManagementControls } from "../../src/control/index.js";
import { botProfile } from "../../src/configuration/bot-profile.js";
import type { Client } from "discord.js";
import type { Logger } from "pino";

describe("language persistence with existing security data", () => {
  it("uses source profile while preserving obsolete presence and isolated voice records across restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "guard-runtime-"));
    const path = join(directory, "guard.sqlite");
    const guildId = "123456789012345678";
    let store = new SqliteStore(path);
    try {
      const legacy = {
        id: "legacy",
        kind: "role",
        subjectId: "423456789012345678",
        actions: ["role.update"],
        expiresAt: Date.now() + 100000,
      };
      store.put(guildId, "whitelist", legacy.id, legacy);
      store.put("$global", "runtime", "presence", {
        version: 1,
        status: "idle",
        activityType: "custom",
        text: "Saved activity",
      });
      store.put(guildId, "runtime", "voice", {
        version: 1,
        guildId,
        channelId: "523456789012345678",
        autoJoin: true,
        selfMute: true,
        selfDeaf: false,
        manualDisconnect: true,
      });
      store.close();
      store = new SqliteStore(path);
      const controls = createManagementControls(
        {} as Client,
        store,
        {} as Logger,
        "999999999999999999",
      );
      expect(controls.presence.getConfig()).toMatchObject({
        status: botProfile.status,
        activityType: botProfile.activityType,
        text: botProfile.activityText,
      });
      expect(store.get("$global", "runtime", "presence")).toMatchObject({
        status: "idle",
        activityType: "custom",
        text: "Saved activity",
      });
      expect(controls.voice.getConfig(guildId)).toMatchObject({
        autoJoin: true,
        selfDeaf: false,
        manualDisconnect: true,
      });
      expect(controls.voice.getConfig("223456789012345678")).toMatchObject({
        autoJoin: false,
        selfMute: true,
        selfDeaf: true,
      });
      expect(store.get(guildId, "whitelist", legacy.id)).toEqual(legacy);
      expect(store.list("$global", "runtime")).toHaveLength(1);
      await controls.voice.dispose();
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("defaults legacy records to Turkish without changing protection, trust or backups", () => {
    const store = new SqliteStore(":memory:");
    try {
      const legacy = store.getConfig("legacy");
      delete legacy.language;
      legacy.mode = "protect";
      legacy.modules["channel.delete"] = {
        enabled: true,
        mode: "protect",
        action: "kick",
        threshold: 3,
        windowMs: 12000,
      };
      store.put("legacy", "config", "main", legacy);
      const whitelist = {
        id: "role:trusted",
        kind: "role",
        subjectId: "trusted",
        actions: ["role.delete"],
        expiresAt: Date.now() + 100000,
      };
      const backup = {
        id: "saved",
        guildId: "legacy",
        createdAt: 123,
        marker: "pre-localization",
      };
      store.put("legacy", "whitelist", whitelist.id, whitelist);
      store.put("legacy", "backups", backup.id, backup);
      expect(languageFor(store, "legacy")).toBe("tr");
      expect(store.getConfig("legacy").modules["channel.delete"]).toEqual(
        legacy.modules["channel.delete"],
      );
      expect(store.get("legacy", "whitelist", whitelist.id)).toEqual(whitelist);
      expect(store.get("legacy", "backups", backup.id)).toEqual(backup);
    } finally {
      store.close();
    }
  });
  it("keeps Turkish and English guild choices isolated across restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "guard-language-"));
    const path = join(directory, "guard.sqlite");
    let store = new SqliteStore(path);
    try {
      const english = store.getConfig("english");
      english.language = "en";
      store.setConfig("english", english);
      const turkish = store.getConfig("turkish");
      turkish.language = "tr";
      store.setConfig("turkish", turkish);
      store.close();
      store = new SqliteStore(path);
      expect(languageFor(store, "english")).toBe("en");
      expect(languageFor(store, "turkish")).toBe("tr");
      expect(languageFor(store, "new")).toBe("tr");
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
