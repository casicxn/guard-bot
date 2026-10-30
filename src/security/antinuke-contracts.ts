export interface ContainmentResult {
  status: "contained" | "partial" | "failed" | "exempt";
  removedRoleIds: string[];
  remainingRoleIds: string[];
  remainingPermissions: string;
  reason: string;
}
export interface RollbackResult {
  effectsApplied?: boolean;
  status:
    | "succeeded"
    | "partial"
    | "failed"
    | "unsupported"
    | "skipped"
    | "uncertain";
  result: string;
  strategy: string;
  newId?: string;
}
export type RollbackStrategy =
  | "delete-created"
  | "snapshot-recreate"
  | "audited-fields"
  | "member-role-delta"
  | "unban-confirmed"
  | "restore-trusted-ban"
  | "manual-rejoin"
  | "unsupported";
