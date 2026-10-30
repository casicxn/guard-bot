import type { Mode } from "../contracts.js";
export type RestartState =
  | "IDLE"
  | "PREPARING"
  | "SNAPSHOTTING"
  | "LOCKING"
  | "LOCKED"
  | "RESTARTING"
  | "VERIFYING"
  | "RESTORING"
  | "COMPLETED"
  | "PARTIAL_FAILURE"
  | "MANUAL_RECOVERY_REQUIRED";
export interface RestartRoleSnapshot {
  roleId: string;
  name: string;
  originalPermissions: string;
  removedPermissions: string;
  lockedPermissions: string;
  actualPermissions?: string;
  position: number;
  manageable: boolean;
  status:
    | "planned"
    | "pending"
    | "locked"
    | "restored"
    | "unchanged"
    | "conflict"
    | "missing"
    | "failed"
    | "uncertain"
    | "skipped";
  error?: string;
}
export interface RestartSession {
  version: 1;
  id: string;
  guildId: string;
  initiatedBy: string;
  createdAt: number;
  updatedAt: number;
  originalMode: Mode;
  state: RestartState;
  roles: RestartRoleSnapshot[];
  risks: string[];
  canActivate: boolean;
  transitions: Array<{ state: RestartState; at: number }>;
}
export interface RestartProtection {
  get(guildId: string): RestartSession | undefined;
  prepare(actorId: string, guildId: string): Promise<RestartSession>;
  activate(
    actorId: string,
    guildId: string,
    sessionId: string,
  ): Promise<RestartSession>;
  restore(
    actorId: string,
    guildId: string,
    sessionId: string,
  ): Promise<RestartSession>;
  cancel(
    actorId: string,
    guildId: string,
    sessionId: string,
  ): Promise<RestartSession>;
  recover(guildId: string): Promise<RestartSession | undefined>;
  drain(): Promise<void>;
}
