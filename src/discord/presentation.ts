import type { Incident } from "../contracts.js";
import { t, moduleName, actionName, type Language } from "../locales/index.js";
import { UserError } from "./errors.js";

/** Translate saved legacy results without exposing raw Discord/API errors in user-facing messages. */
export function operationText(language: Language, text: string): string {
  if (text.includes("\n"))
    return text
      .split("\n")
      .map((line) => operationText(language, line))
      .join("\n");
  const response =
    /^(Containment|Rollback) (contained|partial|failed|exempt|succeeded|unsupported|skipped|uncertain):/.exec(
      text,
    );
  if (response)
    return `${t(language, response[1] === "Containment" ? "response.containment" : "response.rollback")}: ${t(language, `response.${response[2]}`)}`;
  if (text === "Zero-tolerance decision persisted; containment pending")
    return t(language, "response.pending");
  const resource = /^(Role|Channel) (\d+): (.*)$/.exec(text);
  if (resource)
    return t(
      language,
      resource[1] === "Role" ? "ops.resource.role" : "ops.resource.channel",
      { id: resource[2]!, result: operationText(language, resource[3]!) },
    );
  const job = /^Recovery job: (.+)$/.exec(text);
  if (job) return t(language, "ops.job.reference", { id: job[1]! });
  if (text.startsWith("Guild settings: ") || text.startsWith("Guild: "))
    return t(language, "ops.resource.guild", {
      result: operationText(
        language,
        text.replace(/^Guild(?: settings)?: /, ""),
      ),
    });
  const below = /^Below threshold \((\d+)\/(\d+)\)$/.exec(text);
  if (below)
    return t(language, "ops.result.below", {
      count: below[1]!,
      limit: below[2]!,
    });
  const stripped = /^Removed (\d+) dangerous roles\.$/.exec(text);
  if (stripped) return t(language, "ops.result.strip", { count: stripped[1]! });
  const exact: Record<string, string> = {
    "Monitor only": "monitor",
    "Unresolved attribution: no enforcement": "unresolved",
    "Invalid policy: no enforcement": "invalidPolicy",
    "Protected owner or bot self-action": "exempt",
    "Action-specific whitelist": "whitelisted",
    "Decision persisted; enforcement pending": "pending",
    "Recorded without enforcement.": "log",
    "Security warning recorded for incident channel.": "warn",
    "Executor kicked.": "kick",
    "Executor banned; messages retained.": "ban",
    "No removable dangerous roles.": "noDanger",
    "Very High verification enabled. Existing members are not frozen.":
      "locked",
    "Previous verification setting restored.": "unlocked",
    "Audited fields reversed after exact live-state validation.": "reversed",
    "Reverse was already attempted; inspect incident before retrying.":
      "repeatedReverse",
    restored: "restored",
    "managed, skipped": "managed",
    "No supported objects to restore.": "empty",
  };
  if (Object.hasOwn(exact, text))
    return t(language, `ops.result.${exact[text]}`);
  if (
    /Uncertain|manual reconciliation|previous creation|Previously created/i.test(
      text,
    )
  )
    return t(language, "ops.result.uncertain");
  if (/Parent category missing/i.test(text))
    return t(language, "ops.result.parentMissing");
  if (/Overwrite role .* missing/i.test(text))
    return t(language, "ops.result.overwriteMissing");
  if (/Existing channel type differs/i.test(text))
    return t(language, "ops.result.channelType");
  if (
    /cannot safely|Automatic reverse supports|No reliable previous state|Reverse requires|unsupported/i.test(
      text,
    )
  )
    return t(language, "ops.result.unsupported");
  if (/changed since/i.test(text)) return t(language, "ops.result.changed");
  if (/protected|unknown executor/i.test(text))
    return t(language, "ops.result.protected");
  if (/hierarchy|above bot/i.test(text))
    return t(language, "ops.result.hierarchy");
  if (/permission|missing access/i.test(text))
    return t(language, "ops.result.permissions");
  return t(language, "ops.result.dependency");
}
export function incidentText(language: Language, incident: Incident): string {
  const executor =
    incident.confidence === "confirmed" && incident.event.executorId
      ? `<@${incident.event.executorId}>`
      : t(language, "ops.confidence.unresolved");
  return [
    moduleName(language, incident.event.action),
    `${t(language, "ops.incident.id")}: ${incident.id}`,
    `${t(language, "ops.incident.severity")}: ${t(language, `ops.severity.${incident.event.severity ?? "warning"}`)}`,
    `${t(language, "ops.incident.executor")}: ${executor}`,
    `${t(language, "ops.incident.target")}: ${incident.event.targetId ?? "—"}`,
    `${t(language, "ops.incident.time")}: <t:${Math.floor(incident.event.timestamp / 1000)}:f>`,
    `${t(language, "ops.incident.confidence")}: ${t(language, `ops.confidence.${incident.confidence}`)}`,
    `${t(language, "ops.incident.policy")}: ${actionName(language, incident.policy)}`,
    `${t(language, "ops.incident.status")}: ${t(language, `status.${incident.status}`)}`,
    `${t(language, "ops.incident.result")}: ${operationText(language, incident.result)}`,
    ...(incident.containment
      ? [
          t(language, "response.roles", {
            removed: incident.containment.removedRoleIds.length,
            remaining: incident.containment.remainingRoleIds.length,
            permissions: incident.containment.remainingPermissions,
          }),
        ]
      : []),
  ].join("\n");
}
export function previewText(language: Language, text: string): string {
  const match =
    /^Scope: (all|roles|channels|guild)\. Roles: (\d+); channels: (\d+)\. Missing roles: (\d+); missing channels: (\d+)\./.exec(
      text,
    );
  if (!match) throw new UserError("ops.previewUnavailable");
  const skipped = /Skipped channel types: (\d+)/.exec(text)?.[1] ?? "0";
  return (
    t(language, "ops.preview.summary", {
      scope: t(language, `ops.scope.${match[1]}`),
      roles: match[2]!,
      channels: match[3]!,
      missingRoles: match[4]!,
      missingChannels: match[5]!,
    }) +
    "\n\n" +
    t(language, "ops.preview.limits", { skipped })
  );
}

/** Unknown or partial restoration outcomes must never be shown as complete success. */
export function restorationTone(result: string): "success" | "warning" {
  const lines = result.split("\n").filter(Boolean);
  return lines.length > 1 &&
    lines.every(
      (line) =>
        /^Recovery job: [a-f0-9-]+$/i.test(line) ||
        /^(Role|Channel) \d+: restored$/.test(line) ||
        line === "Guild settings: restored",
    )
    ? "success"
    : "warning";
}
