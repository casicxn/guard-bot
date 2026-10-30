import type {
  ContainmentResult,
  RollbackResult,
} from "./security/antinuke-contracts.js";
export type Mode = "monitor" | "protect";
export type Enforcement =
  "log" | "warn" | "strip" | "kick" | "ban" | "lockdown" | "reverse";
export interface ModuleConfig {
  enabled: boolean;
  mode: Mode;
  threshold: number;
  windowMs: number;
  action: Enforcement;
}
export interface GuildConfig {
  zeroTolerance?: boolean;
  protectionActivatedAt?: number;
  notificationsEnabled?: boolean;
  language?: "tr" | "en";
  mode: Mode;
  logChannelId?: string;
  modules: Record<string, ModuleConfig>;
  incidentRetentionDays: number;
  backupRetention: number;
  backupIntervalHours: number;
  lockdown: boolean;
}
export interface WhitelistEntry {
  id: string;
  kind: "user" | "role" | "bot";
  subjectId: string;
  actions: string[];
  expiresAt?: number;
  addedAt?: number;
  addedBy?: string;
}
export interface SecurityEvent {
  overwrite?: { id: string; type: 0 | 1 };
  id: string;
  guildId: string;
  action: string;
  targetId: string | null;
  executorId: string | null;
  timestamp: number;
  source: "audit" | "gateway";
  auditAction?: number;
  changes?: Record<string, unknown>;
  severity?: "info" | "warning" | "critical";
}
export interface Incident {
  enforcementAttempted?: boolean;
  exemption?:
    | "botOwner"
    | "guildOwner"
    | "self"
    | "whitelistUser"
    | "whitelistRole"
    | "trustedBot"
    | "policy";
  containment?: ContainmentResult;
  rollback?: RollbackResult;
  id: string;
  guildId: string;
  event: SecurityEvent;
  createdAt: number;
  confidence: "confirmed" | "unresolved";
  policy: string;
  status: string;
  result: string;
}
export interface Store {
  getConfig(guildId: string): GuildConfig;
  setConfig(guildId: string, config: GuildConfig): void;
  get<T>(guildId: string, collection: string, id: string): T | undefined;
  put<T>(guildId: string, collection: string, id: string, value: T): void;
  list<T>(
    guildId: string,
    collection: string,
    limit?: number,
    offset?: number,
  ): T[];
  claimIncident?(incident: Incident): boolean;
  delete(guildId: string, collection: string, id: string): void;
  claim(guildId: string, key: string): boolean;
  close(): void;
}
export interface ActorContext {
  botOwnerId?: string;
  ownerId: string;
  selfId: string;
  roleIds: string[];
  isBot: boolean;
}
export interface EnforcementAdapter {
  observeTrusted?(event: SecurityEvent): Promise<void>;
  contain?(event: SecurityEvent): Promise<ContainmentResult>;
  rollback?(
    event: SecurityEvent,
    canContinue: () => Promise<boolean>,
  ): Promise<RollbackResult>;
  context(event: SecurityEvent): Promise<ActorContext>;
  enforce(event: SecurityEvent, action: Enforcement): Promise<string>;
  log(incident: Incident): Promise<void>;
}
export interface SecurityProcessor {
  process(event: SecurityEvent): Promise<Incident | undefined>;
}
export interface BackupService {
  create(guildId: string): Promise<{ id: string }>;
  list(guildId: string): { id: string; createdAt: number }[];
  preview(guildId: string, id: string, scope?: string): Promise<string>;
  restore(guildId: string, id: string, scope?: string): Promise<string>;
}
