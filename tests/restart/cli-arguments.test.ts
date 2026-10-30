import { describe, it, expect } from "vitest";
import { parseRecoveryArguments } from "../../src/recovery-cli-arguments.js";
describe("owner recovery CLI arguments", () => {
  const guild = "123456789012345678",
    session = "ab".repeat(12);
  it("requires an explicit matching session confirmation before write intent", () => {
    expect(parseRecoveryArguments(["--guild", guild])).toMatchObject({
      guildId: guild,
      confirm: undefined,
    });
    expect(
      parseRecoveryArguments([
        "--guild",
        guild,
        "--session",
        session,
        "--confirm",
        session,
      ]),
    ).toMatchObject({ confirm: session });
    expect(() =>
      parseRecoveryArguments([
        "--guild",
        guild,
        "--session",
        session,
        "--confirm",
        "cd".repeat(12),
      ]),
    ).toThrow("match");
  });
  it("rejects token/owner overrides, positional values and invalid session IDs", () => {
    for (const args of [
      ["--token", "secret"],
      ["--owner", "123"],
      ["free-text"],
      ["--guild", guild, "--confirm", "yes"],
    ])
      expect(() => parseRecoveryArguments(args)).toThrow();
    expect(parseRecoveryArguments(["--help"])).toEqual({ help: true });
  });
});
