import { describe, it, expect } from "vitest";
import {
  IntentsBitField,
  GatewayIntentBits,
  type Client,
  type Guild,
} from "discord.js";
import { SqliteStore } from "../../src/database/index.js";
import { createPanels, sections } from "../../src/discord/panels.js";
import { Sessions } from "../../src/discord/sessions.js";
import type { BackupService } from "../../src/contracts.js";
import { testControls } from "../helpers/controls.js";
import { t } from "../../src/locales/index.js";
function fixture() {
  const store = new SqliteStore(":memory:");
  const client = {
    options: {
      intents: new IntentsBitField([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
      ]),
    },
    ws: { ping: 12 },
    isReady: () => true,
    uptime: 1000,
  } as unknown as Client;
  const guild = {
    id: "123456789012345678",
    members: {
      fetchMe: async () => ({
        permissions: { has: () => true },
        roles: { highest: { name: "Guard" } },
      }),
    },
  } as unknown as Guild;
  const build = createPanels(
    client,
    store,
    { list: () => [] } as unknown as BackupService,
    new Sessions(),
    undefined,
    testControls(),
  );
  return { store, guild, build };
}
describe("native bilingual panel layouts", () => {
  it('keeps the bot profile read-only while retaining native voice controls',async()=>{
    const f=fixture();
    try{
      const profile=await f.build(f.guild,'999999999999999999','presence');
      const profileComponents=JSON.stringify(profile.components);
      for(const operation of ['presence-status','presence-activity','presence-text','presence-remove','presence-reset'])expect(profileComponents).not.toContain(`guard:${operation}:`);
      expect(profileComponents).toContain('guard:section:');
      const voice=await f.build(f.guild,'999999999999999999','voice');
      expect(JSON.stringify(voice.components)).toContain('guard:voice-channel:');
      expect(JSON.stringify(voice.components)).toContain('guard:voice-action:');
    }finally{f.store.close();}
  });
  it.each(["tr", "en"] as const)(
    "keeps every %s section localized, branded and within component limits",
    async (language) => {
      const f = fixture();
      const config = f.store.getConfig(f.guild.id);
      config.language = language;
      f.store.setConfig(f.guild.id, config);
      try {
        for (const section of sections) {
          const view = await f.build(f.guild, "999999999999999999", section);
          const embed = (
            view.embeds![0] as {
              toJSON: () => { description?: string; footer?: { text: string } };
            }
          ).toJSON();
          expect(embed.footer?.text).toContain(t(language, "common.brand"));
          expect(embed.description?.length ?? 0).toBeLessThanOrEqual(4096);
          expect(view.components!.length).toBeLessThanOrEqual(5);
          for (const row of view.components!) {
            const value = (
              row as { toJSON: () => { components: { options?: unknown[] }[] } }
            ).toJSON();
            expect(value.components.length).toBeLessThanOrEqual(5);
            for (const component of value.components)
              if (component.options)
                expect(component.options.length).toBeLessThanOrEqual(25);
          }
        }
      } finally {
        f.store.close();
      }
    },
  );
  it("uses friendly names across every protection page and never needs a typed ID", async () => {
    const f = fixture();
    try {
      for (let page = 0; page < 3; page++) {
        const view = await f.build(
          f.guild,
          "999999999999999999",
          "modules",
          page,
        );
        const rows = view.components!.map((row) =>
          (
            row as {
              toJSON: () => {
                components: {
                  custom_id?: string;
                  options?: { label: string; value: string }[];
                }[];
              };
            }
          ).toJSON(),
        );
        const select = rows
          .flatMap((row) => row.components)
          .find((c) => c.custom_id?.startsWith("guard:module:"));
        expect(select?.options?.length).toBeGreaterThan(0);
        expect(
          select?.options?.every((option) => option.label !== option.value),
        ).toBe(true);
      }
    } finally {
      f.store.close();
    }
  });
  it("shows actual fixed account-age behavior without an unsupported limit editor", async () => {
    const f = fixture();
    try {
      const view = await f.build(
        f.guild,
        "999999999999999999",
        "modules",
        0,
        "raid.account",
      );
      const description = (
        view.embeds![0] as { toJSON: () => { description: string } }
      ).toJSON().description;
      expect(description).toContain(t("tr", "panel.accountRule"));
      const serialized = view.components!.map((row) =>
        (row as { toJSON: () => unknown }).toJSON(),
      );
      expect(JSON.stringify(serialized)).not.toContain("guard:limit-edit:");
    } finally {
      f.store.close();
    }
  });
  it("separates guild response language from the client locale", async () => {
    const f = fixture();
    try {
      const config = f.store.getConfig(f.guild.id);
      config.language = "en";
      f.store.setConfig(f.guild.id, config);
      const view = await f.build(f.guild, "999999999999999999", "settings");
      const description = (
        view.embeds![0] as { toJSON: () => { description: string } }
      ).toJSON().description;
      expect(description).toContain("Language: English");
    } finally {
      f.store.close();
    }
  });
});

it("does not advertise monitoring-only raid policies as an automatic response", async () => {
  const f = fixture();
  try {
    const config = f.store.getConfig(f.guild.id);
    config.mode = "protect";
    config.modules["raid.join"] = {
      enabled: true,
      mode: "protect",
      action: "ban",
      threshold: 1,
      windowMs: 60000,
    };
    f.store.setConfig(f.guild.id, config);
    const view = await f.build(f.guild, "999999999999999999", "overview");
    const embed = (
      view.embeds![0] as { toJSON: () => { description: string } }
    ).toJSON();
    expect(embed.description).toContain(t("tr", "panel.monitoring"));
  } finally {
    f.store.close();
  }
});
