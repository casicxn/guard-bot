import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Incident } from "../../src/contracts.js";
import {
  createLogger,
  closeLogger,
  formatConsoleRecord,
  CATEGORY_COLORS,
} from "../../src/logging/index.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "guard-logging-"));
  directories.push(path);
  return path;
}
function capture(
  options: Parameters<typeof createLogger>[0] = { LOG_LEVEL: "info" },
  environment: NodeJS.ProcessEnv = { NO_COLOR: "" },
) {
  const lines: string[] = [];
  const logger = createLogger(options, {
    environment,
    output: { write: (line) => lines.push(line), isTTY: true },
  });
  return { logger, lines, text: () => lines.join("") };
}
const incident = (changes: Partial<Incident> = {}): Incident => ({
  id: "audit-1",
  guildId: "guild-1",
  createdAt: 1700000000000,
  confidence: "confirmed",
  policy: "log",
  status: "monitored",
  result: "Monitor only",
  enforcementAttempted: false,
  event: {
    id: "audit-1",
    guildId: "guild-1",
    action: "channel.create",
    executorId: "user-1",
    targetId: "channel-1",
    timestamp: 1700000000000,
    source: "audit",
    severity: "critical",
  },
  ...changes,
});

describe("human-readable Pino console", () => {
  it("uses readable Turkish output by default without raw fields or stacks", async () => {
    const output = capture();
    output.logger.info({ nested: { technical: "object" } }, "Startup complete");
    expect(output.text()).toContain("[INFO] Ultimate Guard aktif.");
    expect(output.text()).not.toContain("nested");
    expect(output.text()).not.toContain('"level"');
    await closeLogger(output.logger);
  });
  it("selects independent English console localization", () => {
    const output = capture({ LOG_LEVEL: "info", LOG_LANGUAGE: "en" });
    output.logger.info({ category: "DATABASE" }, "SQLite connected");
    expect(output.text()).toContain("[DATABASE] SQLite connected.");
    expect(output.text()).not.toContain("bağlantısı");
  });
  it("prints stable hours, minutes and seconds for the recorded timestamp", () => {
    const time = new Date(2026, 9, 30, 14, 32, 1).getTime();
    expect(
      formatConsoleRecord(
        { time, level: 30, msg: "Hello" },
        { language: "en" },
      ),
    ).toBe("[14:32:01] [INFO] Hello\n");
    expect(formatConsoleRecord({ time: "invalid", msg: "Hello" })).toContain(
      "[--:--:--]",
    );
  });
  it("labels every ANSI category with readable text", () => {
    for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
      const line = formatConsoleRecord(
        { time: 0, category, msg: "Example" },
        { colors: true },
      );
      expect(line).toContain(`\u001b[${color}m[${category}]\u001b[0m`);
    }
  });
  it("renders maintenance categories and localized timeout diagnostics", () => {
    expect(CATEGORY_COLORS.LOCKDOWN).toBe(35);
    expect(CATEGORY_COLORS.RESTORE).toBe(36);
    const output = capture();
    output.logger.warn(
      { category: "VOICE" },
      "Voice connection timed out after 15 seconds; security remains operational",
    );
    expect(output.text()).toContain("15 saniyede hazır olmadı");
    expect(
      formatConsoleRecord(
        {
          category: "LOCKDOWN",
          msg: "Guard not ready; restart lockdown retained",
        },
        { language: "tr" },
      ),
    ).toContain("kilidi korunuyor");
  });
  it("respects NO_COLOR even when FORCE_COLOR and TTY are set", () => {
    const output = capture(
      { LOG_LEVEL: "info" },
      { NO_COLOR: "", FORCE_COLOR: "1" },
    );
    output.logger.info({ category: "READY" }, "Startup complete");
    expect(output.text()).not.toContain("\u001b[");
    expect(output.text()).toContain("[READY]");
  });
  it("does not emit debug/trace in ordinary mode", () => {
    const output = capture();
    output.logger.debug("hidden debug");
    output.logger.trace("hidden trace");
    output.logger.info("visible");
    expect(output.lines).toHaveLength(1);
    const diagnostic = capture({ LOG_LEVEL: "trace" });
    diagnostic.logger.trace("trace detail");
    expect(diagnostic.text()).toContain("[DEBUG] trace detail");
  });
  it("renders a real startup summary once per call without dumping objects", () => {
    const output = capture();
    output.logger.info(
      {
        category: "READY",
        summary: {
          guilds: 3,
          modes: "protect, monitor",
          activeModules: 17,
          database: "connected",
          whitelist: 4,
          panels: "restored, disabled",
          voice: "pending",
        },
      },
      "Startup complete",
    );
    expect(output.text()).toContain("ULTIMATE GUARD");
    expect(output.text()).toContain("Koruma, İzleme");
    expect(output.text()).toContain("Geri yüklendi, Kapalı");
    expect(output.text()).toContain("Bekliyor");
    expect(output.text()).not.toContain('"summary"');
  });
  it("removes terminal injection and line breaks from names and errors", () => {
    const output = capture();
    output.logger.info(
      { incident: incident(), executorName: "name\n[READY] fake\u001b[31m" },
      "Guard activity",
    );
    expect(output.lines[0]?.split("\n")).toHaveLength(2);
    expect(output.text()).not.toContain("\u001b[31m");
  });
});

describe("security console classification", () => {
  it("describes the exact successful rollback without inventing additional recovery", () => {
    const output = capture();
    output.logger.info(
      {
        incident: incident({
          status: "handled",
          rollback: {
            status: "succeeded",
            effectsApplied: true,
            strategy: "delete-created",
            result: "Unauthorized channel deleted.",
          },
        }),
      },
      "Guard activity",
    );
    expect(output.text()).toContain("[MITIGATED]");
    expect(output.text()).toContain("Yetkisiz oluşturulan kanal silindi.");
    expect(output.text()).not.toContain("tamamen");
  });
  it("shows verified exemptions SAFE despite critical underlying severity", () => {
    const output = capture();
    output.logger.info(
      {
        incident: incident({
          status: "exempt",
          exemption: "whitelistUser",
          result: "Action-specific whitelist",
        }),
        executorName: "Casi",
      },
      "Guard activity",
    );
    expect(output.text()).toContain("[SAFE]");
    expect(output.text()).toContain("Casi");
    expect(output.text()).toContain("Whitelist");
    expect(output.text()).not.toContain("CRITICAL");
  });
  it("shows confirmed Monitor actions without claiming intervention", () => {
    const output = capture({ LOG_LEVEL: "info", LOG_LANGUAGE: "en" });
    output.logger.info({ incident: incident() }, "Guard activity");
    expect(output.text()).toContain("[MONITOR]");
    expect(output.text()).toContain("user-1");
    expect(output.text()).toContain("without automatic intervention");
  });
  it("reports actual mitigation and explicit partial risk", () => {
    const output = capture({ LOG_LEVEL: "info", LOG_LANGUAGE: "en" });
    output.logger.info(
      {
        incident: incident({
          status: "degraded",
          enforcementAttempted: true,
          containment: {
            status: "partial",
            removedRoleIds: ["role-1"],
            remainingRoleIds: ["role-2"],
            remainingPermissions: "8",
            reason: "Hierarchy",
          },
        }),
      },
      "Guard activity",
    );
    expect(output.text()).toContain("[MITIGATED]");
    expect(output.text()).toContain("1 roles removed");
    expect(output.text()).toMatch(/Partial|partial/);
    expect(output.text()).not.toContain("fully protected");
  });
  it("shows failed intervention without hiding errors", () => {
    const output = capture({ LOG_LEVEL: "info", LOG_LANGUAGE: "en" });
    output.logger.info(
      {
        incident: incident({
          status: "failed",
          enforcementAttempted: true,
          result: "Missing permissions",
        }),
      },
      "Guard activity",
    );
    expect(output.text()).toContain("[FAILED]");
    expect(output.text()).toContain("failed");
  });
  it("never displays a cached guessed name for an unresolved executor", () => {
    const output = capture({ LOG_LEVEL: "info", LOG_LANGUAGE: "en" });
    output.logger.info(
      {
        incident: incident({ confidence: "unresolved" }),
        executorName: "Wrong user",
      },
      "Guard activity",
    );
    expect(output.text()).toContain("[UNRESOLVED]");
    expect(output.text()).not.toContain("Wrong user");
    expect(output.text()).not.toContain("user-1");
  });
  it("never merges concurrent distinct audit events", async () => {
    const output = capture();
    await Promise.all(
      Array.from({ length: 50 }, async (_, index) =>
        output.logger.info(
          {
            incident: incident({ id: `audit-${index}` }),
            incidentId: `audit-${index}`,
          },
          "Guard activity",
        ),
      ),
    );
    expect(output.lines).toHaveLength(50);
  });
});

describe("structured diagnostics and credential protection", () => {
  it("keeps JSON opt-in structured and redacts nested credentials and serialized errors", () => {
    const secret = "fake-credential-for-test-only";
    const output = capture(
      { LOG_LEVEL: "info", LOG_FORMAT: "json" },
      { DISCORD_TOKEN: secret },
    );
    output.logger.error(
      {
        err: new Error(`API rejected ${secret}`),
        nested: {
          apiKey: "another secret",
          AUTHORIZATION: "Bearer private",
          password: "sensitive",
        },
        incident: incident({ exemption: "botOwner", status: "exempt" }),
      },
      `Request used ${secret}`,
    );
    const record = JSON.parse(output.text());
    expect(record.level).toBe(50);
    expect(record.incident.event.severity).toBe("critical");
    expect(record.err.type).toBe("Error");
    expect(record.err.stack).toContain("Error:");
    expect(record.nested.apiKey).toBe("[REDACTED]");
    expect(record.nested.AUTHORIZATION).toBe("[REDACTED]");
    expect(output.text()).not.toContain(secret);
    expect(output.text()).not.toContain("another secret");
    expect(output.text()).not.toContain("\u001b[");
  });
  it("redacts credentials from ordinary console error reasons without printing a stack", () => {
    const output = capture(
      { LOG_LEVEL: "info" },
      { BOT_TOKEN: "fake-token-value-to-protect" },
    );
    output.logger.error(
      { err: new Error("token=fake-token-value-to-protect") },
      "Discord client error",
    );
    expect(output.text()).toContain("[REDACTED]");
    expect(output.text()).not.toContain("fake-token-value-to-protect");
    expect(output.text()).not.toContain(" at ");
  });
  it("writes structured files asynchronously while console stays readable", async () => {
    const path = await directory();
    const output = capture({
      LOG_LEVEL: "info",
      LOG_TO_FILE: "true",
      LOG_DIRECTORY: path,
    });
    output.logger.info(
      {
        incidentId: "incident-42",
        auditEntryId: "audit-42",
        action: "channel.create",
        confidence: "confirmed",
      },
      "Recorded",
    );
    await closeLogger(output.logger);
    const record = JSON.parse(
      await readFile(join(path, "guard.jsonl"), "utf8"),
    );
    expect(record.incidentId).toBe("incident-42");
    expect(record.auditEntryId).toBe("audit-42");
    expect(output.text()).not.toContain('"auditEntryId"');
  });
  it("bounds rotation, keeps recent records, and reduces old retention safely", async () => {
    const path = await directory();
    const output = capture({
      LOG_LEVEL: "info",
      LOG_TO_FILE: "true",
      LOG_DIRECTORY: path,
      LOG_MAX_BYTES: 1024,
      LOG_RETENTION_FILES: 3,
    });
    for (let index = 0; index < 12; index++)
      output.logger.info({ data: "x".repeat(300), sequence: index }, "Record");
    await closeLogger(output.logger);
    const files = await readdir(path);
    expect(files.sort()).toEqual([
      "guard.1.jsonl",
      "guard.2.jsonl",
      "guard.jsonl",
    ]);
    for (const name of files)
      expect((await stat(join(path, name))).size).toBeLessThanOrEqual(1024);
    expect(await readFile(join(path, "guard.jsonl"), "utf8")).toContain(
      '"sequence":11',
    );
    const reduced = capture({
      LOG_LEVEL: "info",
      LOG_TO_FILE: "true",
      LOG_DIRECTORY: path,
      LOG_RETENTION_FILES: 1,
    });
    reduced.logger.info("New process");
    await closeLogger(reduced.logger);
    expect(await readdir(path)).toEqual(["guard.jsonl"]);
  }, 15000);
  it("replaces oversized diagnostics with a bounded marker without hiding console events", async () => {
    const path = await directory();
    const output = capture({
      LOG_LEVEL: "info",
      LOG_TO_FILE: "true",
      LOG_DIRECTORY: path,
      LOG_MAX_BYTES: 1024,
    });
    output.logger.error(
      { details: "x".repeat(1500) },
      "Distinct failed enforcement",
    );
    await closeLogger(output.logger);
    expect(
      JSON.parse(await readFile(join(path, "guard.jsonl"), "utf8")).oversized,
    ).toBe(true);
    expect(output.text()).toContain("Distinct failed enforcement");
  });
  it("isolates file failures and emits a visible warning without recursive logging", async () => {
    const path = await directory();
    const obstruction = join(path, "file");
    await writeFile(obstruction, "fixture");
    const output = capture({
      LOG_LEVEL: "info",
      LOG_TO_FILE: "true",
      LOG_DIRECTORY: join(obstruction, "logs"),
    });
    expect(() => output.logger.info("Security stays active")).not.toThrow();
    await closeLogger(output.logger);
    expect(output.text()).toContain("Security stays active");
    expect(output.text()).toContain("Tanı dosyasına yazılamıyor");
  });
  it("isolates a throwing optional console destination", async () => {
    const logger = createLogger(
      { LOG_LEVEL: "info" },
      {
        environment: {},
        output: {
          write: () => {
            throw new Error("broken output");
          },
        },
      },
    );
    expect(() => logger.error("Distinct critical incident")).not.toThrow();
    await closeLogger(logger);
  });
});
