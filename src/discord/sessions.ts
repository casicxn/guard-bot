import { randomBytes } from "node:crypto";
import type { GuildConfig } from "../contracts.js";
import { UserError } from "./errors.js";
export type PendingAction =
  | { kind: "restart"; action: "activate" | "restore"; sessionId: string }
  | { kind: "panelMove"; channelId: string; expectedMessageId: string }
  | { kind: "protection"; mode: "protect"; expected: string }
  | {
      kind: "config";
      expected: string;
      next: GuildConfig;
      section?: string;
      moduleId?: string;
    }
  | { kind: "reset"; expected: string }
  | { kind: "lockdown"; enabled: boolean; expected: string }
  | { kind: "whitelistRemove"; subject: string; expected: string }
  | { kind: "whitelistUpgrade"; subject: string; expected: string }
  | { kind: "backupRestore"; id: string; scope: string }
  | { kind: "backupDelete"; id: string; expected: string };
export interface Session {
  panelMessageId?: string;
  panelChannelId?: string;
  userId: string;
  guildId: string;
  expiresAt: number;
  moduleId?: string;
  backupId?: string;
  scope?: string;
  section?: string;
  page?: number;
  group?: string;
  view?: string;
  filter?: string;
  jobId?: string;
  pending?: PendingAction;
}
export class Sessions {
  private readonly entries = new Map<string, Session>();
  create(
    userId: string,
    guildId: string,
    extra: Partial<Session> = {},
  ): string {
    for (const [id, item] of this.entries)
      if (item.expiresAt <= Date.now()) this.entries.delete(id);
    if (this.entries.size >= 1000) throw new UserError("error.sessionCapacity");
    const id = randomBytes(12).toString("hex");
    this.entries.set(id, {
      ...extra,
      userId,
      guildId,
      expiresAt: Date.now() + 600000,
    });
    return id;
  }
  get(id: string, userId: string, guildId: string, now = Date.now()): Session {
    const item = this.entries.get(id);
    if (
      !item ||
      item.expiresAt <= now ||
      item.userId !== userId ||
      item.guildId !== guildId
    )
      throw new UserError("error.sessionExpired");
    return item;
  }
  consume(id: string): void {
    if (!this.entries.delete(id)) throw new UserError("error.sessionUsed");
  }
}
