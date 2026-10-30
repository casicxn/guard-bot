import type {
  ActorContext,
  Incident,
  SecurityEvent,
  WhitelistEntry,
} from "../contracts.js";
import { whitelistSchema } from "../configuration/index.js";

export type ActivityClassification =
  "safe" | "monitored" | "mitigated" | "unresolved" | "failed";
export const ACTIVITY_COLORS: Record<ActivityClassification, number> = {
  safe: 0x57f287,
  monitored: 0xfee75c,
  mitigated: 0xed4245,
  unresolved: 0xfaa61a,
  failed: 0x992d22,
};
export const ACTIVITY_INDICATORS: Record<ActivityClassification, string> = {
  safe: "🟢",
  monitored: "🟡",
  mitigated: "🔴",
  unresolved: "🟠",
  failed: "🔴",
};
const reasons = new Set([
  "botOwner",
  "guildOwner",
  "self",
  "whitelistUser",
  "whitelistRole",
  "trustedBot",
  "policy",
]);

/** Mirror existing action/type/expiry trust matching solely to explain a verified exemption. */
export function matchingWhitelistExemption(
  entries: WhitelistEntry[],
  event: SecurityEvent,
  actor: ActorContext,
  now: number,
): Incident["exemption"] {
  const entry = entries
    .map((value) => whitelistSchema.parse(value))
    .find(
      (value) =>
        (value.expiresAt === undefined || value.expiresAt > now) &&
        (value.actions.includes("*") || value.actions.includes(event.action)) &&
        ((value.kind === "user" &&
          !actor.isBot &&
          value.subjectId === event.executorId) ||
          (value.kind === "bot" &&
            actor.isBot &&
            value.subjectId === event.executorId) ||
          (value.kind === "role" && actor.roleIds.includes(value.subjectId))),
    );
  return entry?.kind === "role"
    ? "whitelistRole"
    : entry?.kind === "bot"
      ? "trustedBot"
      : entry
        ? "whitelistUser"
        : undefined;
}
export function verifiedExemption(incident: Incident): Incident["exemption"] {
  if (
    incident.confidence !== "confirmed" ||
    incident.event.source !== "audit" ||
    !incident.event.executorId ||
    !incident.event.targetId
  )
    return;
  if (incident.exemption && reasons.has(incident.exemption))
    return incident.exemption;
  // Historical records were verified by these same engine branches; preserve them without rewriting history.
  if (
    incident.status === "exempt" &&
    [
      "Protected owner or bot self-action",
      "Action-specific whitelist",
    ].includes(incident.result)
  )
    return "policy";
}
export function hasActualIntervention(incident: Incident): boolean {
  if (
    incident.confidence !== "confirmed" ||
    incident.event.source !== "audit" ||
    !incident.event.executorId ||
    !incident.event.targetId
  )
    return false;
  if (
    Array.isArray(incident.containment?.removedRoleIds) &&
    incident.containment.removedRoleIds.length > 0
  )
    return true;
  if (
    incident.rollback?.effectsApplied === true &&
    ["succeeded", "partial"].includes(incident.rollback.status)
  )
    return true;
  if (incident.status !== "handled") return false;
  if (incident.policy === "strip")
    return /^Removed [1-9]\d* dangerous roles\.$/.test(incident.result);
  return (
    (incident.policy === "kick" && incident.result === "Executor kicked.") ||
    (incident.policy === "ban" &&
      incident.result === "Executor banned; messages retained.") ||
    (incident.policy === "reverse" &&
      incident.result ===
        "Audited fields reversed after exact live-state validation.") ||
    (incident.policy === "lockdown" &&
      [
        "Very High verification enabled. Existing members are not frozen.",
        "Previous verification setting restored.",
      ].includes(incident.result))
  );
}
export function classifyActivity(incident: Incident): ActivityClassification {
  if (
    incident.confidence !== "confirmed" ||
    incident.event.source !== "audit" ||
    !incident.event.executorId ||
    !incident.event.targetId
  )
    return "unresolved";
  if (verifiedExemption(incident)) return "safe";
  if (hasActualIntervention(incident)) return "mitigated";
  if (incident.status === "pending") return "unresolved";
  if (incident.status === "failed" && incident.enforcementAttempted === false)
    return "unresolved";
  if (
    incident.rollback?.status === "uncertain" ||
    (incident.containment?.remainingPermissions === "unknown" &&
      incident.containment.status !== "failed")
  )
    return "unresolved";
  if (
    incident.status === "failed" ||
    incident.containment?.status === "failed" ||
    incident.rollback?.status === "failed" ||
    incident.rollback?.status === "unsupported" ||
    incident.containment?.status === "partial"
  )
    return "failed";
  if (incident.status === "degraded" && incident.rollback?.status !== "skipped")
    return "unresolved";
  if (
    incident.status === "handled" &&
    !["log", "warn"].includes(incident.policy) &&
    incident.result !== "No removable dangerous roles."
  )
    return "unresolved";
  return "monitored";
}
export const isSafeActivity = (incident: Incident): boolean =>
  classifyActivity(incident) === "safe";
export const isHostileIncident = (incident: Incident): boolean =>
  !isSafeActivity(incident);
export function activityReason(incident: Incident): string {
  const exemption = verifiedExemption(incident);
  if (exemption) return exemption;
  if (incident.status === "pending") return "pending";
  const kind = classifyActivity(incident);
  if (kind === "mitigated") return "intervention";
  if (kind === "failed" || kind === "unresolved") return kind;
  return incident.status === "pending" ? "pending" : "monitor";
}
