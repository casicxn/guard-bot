import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../src/database/index.js";
describe("single runtime process lease", () => {
  it("recovers a previous process generation with a reused container PID", () => {
    const database = new SqliteStore(":memory:");
    try {
      database.put("$system", "process_lease", "main", {
        pid: process.pid,
        host: hostname(),
        nonce: "crashed",
        startedAt: 1,
      });
      expect(() => database.acquireProcessLease()).not.toThrow();
      expect(
        database.get<{ nonce: string }>("$system", "process_lease", "main")
          ?.nonce,
      ).not.toBe("crashed");
    } finally {
      database.close();
    }
  });
  it("refuses a second owner and permits it only after the first closes", () => {
    const directory = mkdtempSync(join(tmpdir(), "guard-lease-"));
    const path = join(directory, "guard.sqlite");
    const first = new SqliteStore(path),
      second = new SqliteStore(path);
    try {
      first.acquireProcessLease();
      first.acquireProcessLease();
      expect(() => second.acquireProcessLease()).toThrow("Another Guard");
      first.close();
      expect(() => second.acquireProcessLease()).not.toThrow();
    } finally {
      second.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("does not take over a different host or corrupt record", () => {
    const database = new SqliteStore(":memory:");
    try {
      database.put("$system", "process_lease", "main", {
        pid: process.pid,
        host: "other-" + hostname(),
        nonce: "foreign",
      });
      expect(() => database.acquireProcessLease()).toThrow("another host");
      database.put("$system", "process_lease", "main", {
        pid: -1,
        host: hostname(),
        nonce: "bad",
      });
      expect(() => database.acquireProcessLease()).toThrow("invalid");
    } finally {
      database.close();
    }
  });
});
