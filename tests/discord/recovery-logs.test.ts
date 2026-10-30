import { describe, it, expect } from "vitest";
import { SqliteStore } from "../../src/database/index.js";
import { recoveryJobPage } from "../../src/discord/recovery-logs.js";
import { t } from "../../src/locales/index.js";
describe("localized Discord recovery operation logs", () => {
  it("keeps all long operation results accessible over pages", () => {
    const store = new SqliteStore(":memory:");
    try {
      const results = Array.from(
        { length: 200 },
        (_, i) => `Role ${123456789012345600n + BigInt(i)}: restored`,
      );
      store.put("guild", "recovery_jobs", "job", {
        id: "job",
        snapshotId: "snapshot",
        state: "finished",
        results,
      });
      const pages = [];
      for (let page = 0; page < 10; page++) {
        try {
          pages.push(recoveryJobPage(store, "guild", "job", page).description);
        } catch {
          break;
        }
      }
      expect(pages.join("")).toContain("Rol 123456789012345799: Geri yüklendi");
      expect(pages.length).toBeGreaterThan(1);
    } finally {
      store.close();
    }
  });
  it("does not expose another guild recovery jobs and follows server language", () => {
    const store = new SqliteStore(":memory:");
    try {
      store.put("private", "recovery_jobs", "job", {
        id: "job",
        snapshotId: "s",
        state: "finished",
        results: ["private"],
      });
      expect(() => recoveryJobPage(store, "other", "job", 0)).toThrow();
      expect(recoveryJobPage(store, "other", null, 0).description).toBe(
        t("tr", "ops.jobs.none"),
      );
      const c = store.getConfig("other");
      c.language = "en";
      store.setConfig("other", c);
      expect(recoveryJobPage(store, "other", null, 0).description).toBe(
        t("en", "ops.jobs.none"),
      );
    } finally {
      store.close();
    }
  });
});
