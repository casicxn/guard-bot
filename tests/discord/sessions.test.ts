import { describe, expect, it } from "vitest";
import { Sessions } from "../../src/discord/sessions.js";
describe("interaction authorization", () => {
  it("binds sessions to user and guild and expires them", () => {
    const sessions = new Sessions();
    const id = sessions.create("owner", "guild", { backupId: "backup" });
    expect(sessions.get(id, "owner", "guild").backupId).toBe("backup");
    expect(() => sessions.get(id, "other", "guild")).toThrow();
    expect(() => sessions.get(id, "owner", "other")).toThrow();
    expect(() =>
      sessions.get(id, "owner", "guild", Date.now() + 600001),
    ).toThrow();
  });
  it("consumes confirmations once", () => {
    const s = new Sessions();
    const id = s.create("o", "g");
    s.consume(id);
    expect(() => s.get(id, "o", "g")).toThrow();
  });
  it("does not allow extra metadata to override the session binding", () => {
    const sessions = new Sessions();
    const id = sessions.create("owner", "guild", {
      userId: "intruder",
      guildId: "other",
      expiresAt: Infinity,
    });
    const session = sessions.get(id, "owner", "guild");
    expect(session.userId).toBe("owner");
    expect(session.guildId).toBe("guild");
    expect(session.expiresAt).toBeLessThan(Infinity);
  });
});
