import {
  mkdir,
  stat,
  appendFile,
  copyFile,
  truncate,
  rm,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";

const missing = (error: unknown) =>
  error &&
  typeof error === "object" &&
  "code" in error &&
  error.code === "ENOENT";
/** Serialized asynchronous I/O with finite disk retention and a finite in-memory backlog. */
export class RotatingFileSink {
  private pending: Promise<void> = Promise.resolve();
  private initialized = false;
  private disabled = false;
  private closed = false;
  private size = 0;
  private queued = 0;
  private overflowWarned = false;
  readonly maxBytes: number;
  readonly retentionFiles: number;
  constructor(
    readonly directory: string,
    private readonly warning: (reason: "file" | "queue") => void,
    maxBytes = 5 * 1024 * 1024,
    retentionFiles = 5,
  ) {
    this.maxBytes = Math.max(1024, Math.min(100 * 1024 * 1024, maxBytes));
    this.retentionFiles = Math.max(
      1,
      Math.min(100, Math.floor(retentionFiles)),
    );
  }
  private file(index = 0) {
    return join(this.directory, index ? `guard.${index}.jsonl` : "guard.jsonl");
  }
  write(line: string): void {
    if (this.disabled || this.closed) return;
    if (Buffer.byteLength(line) > this.maxBytes)
      line =
        JSON.stringify({
          time: Date.now(),
          level: 40,
          msg: "Diagnostic record exceeded file size limit; console event retained",
          oversized: true,
        }) + "\n";
    const bytes = Buffer.byteLength(line);
    if (this.queued + bytes > 2 * 1024 * 1024) {
      if (!this.overflowWarned) {
        this.overflowWarned = true;
        this.warning("queue");
      }
      return;
    }
    this.queued += bytes;
    this.pending = this.pending
      .then(async () => {
        if (this.disabled) return;
        if (!this.initialized) {
          await mkdir(this.directory, { recursive: true });
          for (const name of await readdir(this.directory)) {
            const archive = /^guard\.(\d+)\.jsonl$/.exec(name);
            if (archive && Number(archive[1]) >= this.retentionFiles)
              await rm(join(this.directory, name), { force: true });
          }
          try {
            this.size = (await stat(this.file())).size;
          } catch (error) {
            if (!missing(error)) throw error;
          }
          this.initialized = true;
        }
        if (this.size && this.size + bytes > this.maxBytes) {
          for (let index = this.retentionFiles - 2; index >= 0; index--) {
            try {
              await copyFile(this.file(index), this.file(index + 1));
            } catch (error) {
              if (!missing(error)) throw error;
            }
          }
          // Copying archives also works when Windows refuses rename on viewed log files.
          // Truncate the current diagnostic file only after archive copies complete.
          await truncate(this.file(), 0);
          this.size = 0;
        }
        await appendFile(this.file(), line, { mode: 0o600 });
        this.size += bytes;
      })
      .catch(() => {
        this.disabled = true;
        this.warning("file");
      })
      .finally(() => {
        this.queued -= bytes;
      });
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.pending;
  }
}
