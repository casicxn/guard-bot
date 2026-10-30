import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  persistentPath,
  projectRoot,
  readEnvironment,
} from "../../src/configuration/index.js";
const base = {
  DISCORD_TOKEN: "x".repeat(24),
  BOT_OWNER_ID: "123456789012345678",
  DISCORD_CLIENT_ID: "234567890123456789",
};
describe("console configuration and persistent locations", () => {
  it("defaults to Turkish pretty console and one project-relative database", () => {
    const config = readEnvironment(base);
    expect(config.LOG_FORMAT).toBe("pretty");
    expect(config.LOG_LANGUAGE).toBe("tr");
    expect(config.LOG_TO_FILE).toBe("false");
    expect(config.DATABASE_PATH).toBe(
      resolve(projectRoot, "data/guard.sqlite"),
    );
    expect(persistentPath(":memory:")).toBe(":memory:");
    expect(persistentPath(config.DATABASE_PATH)).toBe(config.DATABASE_PATH);
  });
  it("accepts trace/JSON/English/file logging and rejects malformed settings", () => {
    expect(
      readEnvironment({
        ...base,
        LOG_LEVEL: "trace",
        LOG_FORMAT: "json",
        LOG_LANGUAGE: "en",
        LOG_TO_FILE: "true",
      }),
    ).toMatchObject({
      LOG_LEVEL: "trace",
      LOG_FORMAT: "json",
      LOG_LANGUAGE: "en",
      LOG_TO_FILE: "true",
    });
    for (const bad of [
      { LOG_FORMAT: "raw" },
      { LOG_LANGUAGE: "de" },
      { LOG_TO_FILE: "yes" },
      { DATABASE_PATH: "" },
    ])
      expect(() => readEnvironment({ ...base, ...bad })).toThrow();
  });
});
