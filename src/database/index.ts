import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
const processStartedAt = Math.round(Date.now() - process.uptime() * 1000);
import type { Store, GuildConfig, Incident } from "../contracts.js";
import { configSchema } from "../configuration/index.js";
import { defaultModules } from "../security/index.js";
import { publishChange } from "../change-events.js";
export class SqliteStore implements Store {
  private readonly db: DatabaseSync;
  private processLease?: string;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.initialize();
    } catch (error) {
      // A failed migration must release its transaction/handle without resetting data.
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Initialization may have failed before a transaction began.
      }
      this.db.close();
      throw new Error(
        "SQLite initialization or migration failed; existing data was preserved",
        {
          cause: error,
        },
      );
    }
  }
  private initialize(): void {
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);`,
    );
    if (
      !this.db.prepare("SELECT version FROM migrations WHERE version=1").get()
    ) {
      this.db.exec(
        `BEGIN IMMEDIATE; CREATE TABLE records(guild_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), updated_at INTEGER NOT NULL, PRIMARY KEY(guild_id,collection,id)); CREATE INDEX records_retention ON records(collection,updated_at); CREATE TABLE claims(guild_id TEXT NOT NULL, key TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(guild_id,key)); INSERT INTO migrations VALUES(1); COMMIT;`,
      );
    }
    if (
      !this.db.prepare("SELECT version FROM migrations WHERE version=2").get()
    ) {
      this.db.exec(
        "BEGIN IMMEDIATE; CREATE INDEX records_guild_page ON records(guild_id,collection,updated_at DESC,id); INSERT INTO migrations VALUES(2); COMMIT;",
      );
    }
    if (
      !this.db.prepare("SELECT version FROM migrations WHERE version=3").get()
    ) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS record_schemas(collection TEXT PRIMARY KEY,version INTEGER NOT NULL);
        INSERT OR IGNORE INTO record_schemas VALUES('config',2),('protection_preferences',1),('containment_records',1),('containment_operations',1),('rollback_attempts',1),('incident_processing',1),('known_good_snapshots',1),('recovery_guard',1),('trusted_history',1),('configuration_history',1);
        UPDATE records SET value=json_set(value,'$.zeroTolerance',json('false')) WHERE collection='config' AND id='main' AND json_type(value,'$.zeroTolerance') IS NULL;
        INSERT INTO migrations VALUES(3); COMMIT;`);
    }
    if (
      !this.db.prepare("SELECT version FROM migrations WHERE version=4").get()
    ) {
      this.db.exec(
        "BEGIN IMMEDIATE; INSERT OR IGNORE INTO record_schemas VALUES('permanent_panel',1),('panel_creation',1); INSERT INTO migrations VALUES(4); COMMIT;",
      );
    }
    if (
      !this.db.prepare("SELECT version FROM migrations WHERE version=5").get()
    ) {
      this.db.exec(
        "BEGIN IMMEDIATE; INSERT OR IGNORE INTO record_schemas VALUES('restart_sessions',1),('restart_active',1),('restart_plans',1),('restart_operations',1); INSERT INTO migrations VALUES(5); COMMIT;",
      );
    }
  }
  getConfig(guildId: string): GuildConfig {
    const existing = this.get(guildId, "config", "main");
    const parsed = configSchema.parse(
      existing ?? {
        mode: "monitor",
        modules: {},
        incidentRetentionDays: 30,
        backupRetention: 10,
        backupIntervalHours: 0,
        lockdown: false,
      },
    );
    return { ...parsed, modules: { ...defaultModules(), ...parsed.modules } };
  }
  setConfig(guildId: string, config: GuildConfig): void {
    this.put(guildId, "config", "main", configSchema.parse(config));
  }
  get<T>(guildId: string, collection: string, id: string): T | undefined {
    const row = this.db
      .prepare(
        "SELECT value FROM records WHERE guild_id=? AND collection=? AND id=?",
      )
      .get(guildId, collection, id);
    return row ? (JSON.parse(String(row.value)) as T) : undefined;
  }
  put<T>(guildId: string, collection: string, id: string, value: T): void {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(guild_id,collection,id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      )
      .run(guildId, collection, id, JSON.stringify(value), Date.now());
    publishChange(this, guildId, collection);
  }
  list<T>(guildId: string, collection: string, limit = -1, offset = 0): T[] {
    return this.db
      .prepare(
        "SELECT value FROM records WHERE guild_id=? AND collection=? ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",
      )
      .all(guildId, collection, limit, offset)
      .map((row) => JSON.parse(String(row.value)) as T);
  }
  delete(guildId: string, collection: string, id: string): void {
    this.db
      .prepare("DELETE FROM records WHERE guild_id=? AND collection=? AND id=?")
      .run(guildId, collection, id);
    publishChange(this, guildId, collection);
  }
  claim(guildId: string, key: string): boolean {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO claims VALUES(?,?,?)")
        .run(guildId, key, Date.now()).changes === 1
    );
  }
  cleanup(guildId: string): void {
    const cutoff =
      Date.now() - this.getConfig(guildId).incidentRetentionDays * 86400000;
    const incidentsRemoved = this.db
      .prepare(
        "DELETE FROM records WHERE guild_id=? AND collection='incidents' AND updated_at<?",
      )
      .run(guildId, cutoff);
    if (incidentsRemoved.changes) publishChange(this, guildId, "incidents");
    this.db
      .prepare("DELETE FROM claims WHERE guild_id=? AND created_at<?")
      .run(guildId, Date.now() - 30 * 86400000);
    this.db
      .prepare(
        "DELETE FROM records WHERE guild_id=? AND collection='counters' AND updated_at<?",
      )
      .run(guildId, Date.now() - 86400000);
    const whitelistRemoved = this.db
      .prepare(
        "DELETE FROM records WHERE guild_id=? AND collection='whitelist' AND json_extract(value,'$.expiresAt')<=?",
      )
      .run(guildId, Date.now());
    if (whitelistRemoved.changes) publishChange(this, guildId, "whitelist");
  }
  claimIncident(incident: Incident): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!this.claim(incident.guildId, "security:" + incident.id)) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.put(incident.guildId, "incidents", incident.id, incident);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /** Prevent the maintenance CLI and main runtime from owning one database together. */
  acquireProcessLease(): void {
    if (this.processLease) return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.get<{
        pid: number;
        host: string;
        nonce: string;
        startedAt?: number;
      }>("$system", "process_lease", "main");
      if (previous) {
        if (
          !Number.isSafeInteger(previous.pid) ||
          previous.pid <= 0 ||
          previous.host !== hostname() ||
          typeof previous.nonce !== "string"
        )
          throw new Error(
            "Database process lease is invalid or belongs to another host; manual review required",
          );
        // A recreated container can reuse its previous Node PID.
        let active = !(
          previous.pid === process.pid &&
          Number.isSafeInteger(previous.startedAt) &&
          previous.startedAt! < processStartedAt
        );
        try {
          if (active) process.kill(previous.pid, 0);
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ESRCH"
          )
            active = false;
        }
        if (active)
          throw new Error(
            "Another Guard runtime or recovery CLI owns this database; stop it first",
          );
      }
      const nonce = randomUUID();
      this.put("$system", "process_lease", "main", {
        pid: process.pid,
        host: hostname(),
        nonce,
        createdAt: Date.now(),
        startedAt: processStartedAt,
      });
      this.db.exec("COMMIT");
      this.processLease = nonce;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    if (this.processLease) {
      this.db
        .prepare(
          "DELETE FROM records WHERE guild_id='$system' AND collection='process_lease' AND id='main' AND json_extract(value,'$.nonce')=?",
        )
        .run(this.processLease);
      this.processLease = undefined;
    }
    this.db.close();
  }
}
