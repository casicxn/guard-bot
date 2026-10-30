import type { ModuleConfig } from "../contracts.js";
import type { RollbackStrategy } from "./antinuke-contracts.js";
export interface GuardModule {
  id: string;
  auditActions: number[];
  severity: "info" | "warning" | "critical";
  recovery: string;
  rollback: RollbackStrategy;
  administrative: boolean;
}
const rows: [string, number[], GuardModule["severity"]][] = [
  ["guild.update", [1], "warning"],
  ["channel.create", [10], "warning"],
  ["channel.update", [11], "warning"],
  ["channel.delete", [12], "critical"],
  ["channel.overwrite", [13, 14, 15], "critical"],
  ["member.kick", [20], "critical"],
  ["member.ban", [22], "critical"],
  ["member.unban", [23], "warning"],
  ["member.role", [25], "critical"],
  ["member.permissions", [25], "critical"],
  ["member.bot", [28], "critical"],
  ["role.create", [30], "warning"],
  ["role.update", [31], "warning"],
  ["role.delete", [32], "critical"],
  ["role.permissions", [30, 31], "critical"],
  ["invite.create", [40], "info"],
  ["invite.update", [41], "info"],
  ["invite.delete", [42], "info"],
  ["webhook.create", [50], "critical"],
  ["webhook.update", [51], "warning"],
  ["webhook.delete", [52], "warning"],
  ["emoji.create", [60], "info"],
  ["emoji.update", [61], "info"],
  ["emoji.delete", [62], "warning"],
  ["integration.create", [80], "warning"],
  ["integration.update", [81], "warning"],
  ["integration.delete", [82], "warning"],
  ["sticker.create", [90], "info"],
  ["sticker.update", [91], "info"],
  ["sticker.delete", [92], "warning"],
  ["event.create", [100], "info"],
  ["event.update", [101], "info"],
  ["event.delete", [102], "warning"],
  ["thread.create", [110], "info"],
  ["thread.update", [111], "info"],
  ["thread.delete", [112], "warning"],
  ["soundboard.create", [130], "info"],
  ["soundboard.update", [131], "info"],
  ["soundboard.delete", [132], "warning"],
  ["automod.create", [140], "warning"],
  ["automod.update", [141], "critical"],
  ["automod.delete", [142], "critical"],
  ["raid.join", [], "warning"],
  ["raid.message", [], "warning"],
  ["raid.mention", [], "warning"],
  ["raid.account", [], "info"],
];
export const MODULES: readonly GuardModule[] = rows.map(
  ([id, auditActions, severity]) => ({
    id,
    auditActions,
    severity,
    administrative:
      auditActions.length > 0 &&
      !id.startsWith("invite.") &&
      !id.startsWith("thread."),
    rollback:
      id === "channel.create" ||
      id === "role.create" ||
      id === "webhook.create" ||
      id === "automod.create"
        ? "delete-created"
        : id === "channel.delete" || id === "role.delete"
          ? "snapshot-recreate"
          : id === "member.role" || id === "member.permissions"
            ? "member-role-delta"
            : id === "member.ban"
              ? "unban-confirmed"
              : id === "member.unban"
                ? "restore-trusted-ban"
                : id === "member.kick"
                  ? "manual-rejoin"
                  : [
                        "channel.update",
                        "channel.overwrite",
                        "role.update",
                        "role.permissions",
                        "guild.update",
                      ].includes(id)
                    ? "audited-fields"
                    : "unsupported",
    recovery:
      id === "role.update" || id === "role.permissions" || id === "guild.update"
        ? "Limited exact audited field reversal; unsupported fields fail safely"
        : id.startsWith("role.") || id.startsWith("channel.")
          ? "Manual structural snapshot restoration; deleted resources receive new IDs"
          : "Monitoring/enforcement only; no structural reversal",
  }),
);
export function actionForAudit(action: number): string | undefined {
  return MODULES.find((m) => m.auditActions.includes(action))?.id;
}
export function defaultModules(): Record<string, ModuleConfig> {
  return Object.fromEntries(
    MODULES.map((m) => [
      m.id,
      {
        enabled: !m.id.startsWith("raid."),
        mode: "monitor",
        threshold: ["member.ban", "member.kick"].includes(m.id)
          ? 5
          : m.id === "raid.join"
            ? 10
            : m.id === "raid.message"
              ? 8
              : m.id === "raid.mention"
                ? 10
                : 1,
        windowMs: 60000,
        action: "log",
      },
    ]),
  );
}
export const DANGEROUS_PERMISSIONS = [
  3n,
  4n,
  5n,
  1n,
  2n,
  28n,
  29n,
  30n,
  40n,
  13n,
  33n,
  34n,
  43n,
  44n,
].reduce((mask, bit) => mask | (1n << bit), 0n);
export function dangerousPermissionGrant(
  before: string,
  after: string,
): boolean {
  try {
    return (BigInt(after) & ~BigInt(before) & DANGEROUS_PERMISSIONS) !== 0n;
  } catch {
    return false;
  }
}
