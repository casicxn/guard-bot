import type { Incident } from "../contracts.js";
import { t, type Language } from "../locales/index.js";
import { operationText } from "../discord/presentation.js";
import { activityReason, classifyActivity } from "../security/activity.js";
import { consoleMessage } from "./messages.js";

export const CATEGORY_COLORS = {
  READY: 92,
  SAFE: 32,
  INFO: 34,
  MONITOR: 33,
  WARNING: 33,
  BLOCKED: 31,
  MITIGATED: 31,
  UNRESOLVED: 33,
  FAILED: 91,
  ERROR: 91,
  CRITICAL: 91,
  RECOVERY: 36,
  LOCKDOWN: 35,
  RESTORE: 36,
  BACKUP: 35,
  VOICE: 36,
  DATABASE: 34,
  CONFIG: 34,
  SECURITY: 35,
  PANEL: 36,
  NOTIFY: 32,
  DEBUG: 90,
} as const;
export type LogCategory = keyof typeof CATEGORY_COLORS;
export type LogRecord = Record<string, unknown>;
const classificationCategory = {
  safe: "SAFE",
  monitored: "MONITOR",
  mitigated: "MITIGATED",
  unresolved: "UNRESOLVED",
  failed: "FAILED",
} as const;
const clean = (value: unknown, max = 800): string =>
  String(value ?? "")
    // eslint-disable-next-line no-control-regex -- Strip untrusted terminal escapes and line controls.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, max)
    .trim();

function incidentFrom(record: LogRecord): Incident | undefined {
  const candidate = record.incident;
  if (!candidate || typeof candidate !== "object") return;
  const incident = candidate as Partial<Incident>;
  if (
    !incident.event ||
    typeof incident.event.action !== "string" ||
    typeof incident.result !== "string" ||
    typeof incident.status !== "string"
  )
    return;
  return incident as Incident;
}

export function recordCategory(record: LogRecord): LogCategory {
  const incident = incidentFrom(record);
  if (incident) return classificationCategory[classifyActivity(incident)];
  const explicit = String(record.category ?? "").toUpperCase();
  if (Object.hasOwn(CATEGORY_COLORS, explicit)) return explicit as LogCategory;
  if (Number(record.level) >= 60) return "CRITICAL";
  if (Number(record.level) >= 50) return "ERROR";
  if (Number(record.level) >= 40) return "WARNING";
  if (Number(record.level) <= 20) return "DEBUG";
  const msg = String(record.msg ?? "");
  if (/voice/i.test(msg)) return "VOICE";
  if (/panel/i.test(msg)) return "PANEL";
  if (/backup/i.test(msg)) return "BACKUP";
  if (/lockdown/i.test(msg)) return "LOCKDOWN";
  if (/permission restoration|permissions restored/i.test(msg))
    return "RESTORE";
  if (/recovery|rollback/i.test(msg)) return "RECOVERY";
  if (/notification/i.test(msg)) return "NOTIFY";
  if (/sqlite|database/i.test(msg)) return "DATABASE";
  if (/configuration|profile|presence|description/i.test(msg)) return "CONFIG";
  return "INFO";
}

function incidentMessage(
  record: LogRecord,
  incident: Incident,
  language: Language,
): string {
  const kind = classifyActivity(incident),
    reason = activityReason(incident);
  const action =
    incident.event.action === "role.permissions" &&
    incident.event.auditAction === 30
      ? "role.create"
      : incident.event.action;
  const parts = [t(language, `activity.action.${action}`)];
  const verified =
    incident.confidence === "confirmed" && incident.event.source === "audit";
  parts.push(
    `${language === "tr" ? "Kullanıcı" : "Executor"}: ${
      verified && incident.event.executorId
        ? clean(record.executorName || incident.event.executorId, 100)
        : t(language, "common.unknown")
    }`,
  );
  if (incident.event.targetId)
    parts.push(
      `${language === "tr" ? "Hedef" : "Target"}: ${clean(record.targetName || incident.event.targetId, 100)}`,
    );
  parts.push(t(language, `activity.reason.${reason}`));
  if (kind !== "safe") parts.push(operationText(language, incident.result));
  if (incident.containment) {
    parts.push(
      `${language === "tr" ? "Yetki kısıtlama" : "Containment"}: ${t(language, `response.${incident.containment.status}`)} (${incident.containment.removedRoleIds.length} ${language === "tr" ? "rol kaldırıldı" : "roles removed"})`,
    );
  }
  if (incident.rollback)
    parts.push(
      `${language === "tr" ? "Geri alma" : "Rollback"}: ${t(language, `response.${incident.rollback.status}`)} — ${clean(consoleMessage(incident.rollback.result, language), 350)}`,
    );
  if (
    kind === "mitigated" &&
    (incident.containment?.status === "partial" ||
      incident.containment?.status === "failed" ||
      (incident.rollback && incident.rollback.status !== "succeeded"))
  )
    parts.push(t(language, "activity.detail.partial"));
  return parts.join(" | ");
}

/** Pure formatter; never prints objects or stack traces in the ordinary terminal view. */
export function formatConsoleRecord(
  record: LogRecord,
  options: { language?: Language; colors?: boolean; format?: string } = {},
): string {
  const language = options.language ?? "tr",
    category = recordCategory(record);
  const date = new Date(
    typeof record.time === "number" || typeof record.time === "string"
      ? record.time
      : Date.now(),
  );
  const time = Number.isNaN(date.getTime())
    ? "--:--:--"
    : date.toLocaleTimeString("en-GB", { hour12: false });
  const label = `[${category}]`,
    colored = options.colors
      ? `\u001b[${CATEGORY_COLORS[category]}m${label}\u001b[0m`
      : label;
  const incident = incidentFrom(record);
  let message = incident
    ? incidentMessage(record, incident, language)
    : consoleMessage(clean(record.msg || record.message || category), language);
  if (!incident) {
    for (const [key, labelTr, labelEn] of [
      ["guildId", "Sunucu", "Guild"],
      ["incidentId", "Olay", "Incident"],
      ["sessionId", "Oturum", "Session"],
      ["roleId", "Rol", "Role"],
      ["state", "Durum", "State"],
      ["status", "Durum", "Status"],
      ["mode", "Mod", "Mode"],
      ["activeModules", "Aktif korumalar", "Active protections"],
    ]) {
      const value = record[key!];
      if (typeof value === "string" || typeof value === "number")
        message += ` | ${language === "tr" ? labelTr : labelEn}: ${clean(key === "state" && ["LOCKDOWN", "RESTORE"].includes(category) && typeof value === "string" ? t(language, `startup.restart.${value}`) : value, 100)}`;
    }
    const error = record.err ?? record.error;
    if (error) {
      const reason =
        typeof error === "object" && "message" in error
          ? error.message
          : typeof error === "string"
            ? error
            : undefined;
      if (reason)
        message += ` | ${language === "tr" ? "Sebep" : "Reason"}: ${clean(reason, 250)}`;
    }
  }
  let rendered = `[${time}] ${colored} ${clean(message, 1800)}\n`;
  if (record.summary && typeof record.summary === "object") {
    const summary = record.summary as LogRecord;
    const labels: [string, string, string][] = [
      ["guilds", "Bağlı sunucular", "Connected guilds"],
      ["modes", "Koruma modları", "Security modes"],
      ["activeModules", "Aktif korumalar", "Active protections"],
      ["database", "Veritabanı", "Database"],
      ["whitelist", "Whitelist kayıtları", "Whitelist entries"],
      ["panels", "Kontrol panelleri", "Control panels"],
      ["voice", "Ses bağlantıları", "Voice connections"],
      ["restart", "Yeniden başlatma koruması", "Restart lockdown"],
    ];
    const statuses: Record<string, [string, string]> = {
      monitor: ["Monitor", "İzleme"],
      protect: ["Protect", "Koruma"],
      connected: ["Connected", "Bağlı"],
      unavailable: ["Unavailable", "Kullanılamıyor"],
      restored: ["Restored", "Geri yüklendi"],
      pending: ["Pending", "Bekliyor"],
      disabled: ["Disabled", "Kapalı"],
      paused: ["Paused", "Duraklatıldı"],
      disconnected: ["Disconnected", "Bağlı değil"],
      IDLE: ["Inactive", "Etkin değil"],
      PREPARING: ["Preparing", "Hazırlanıyor"],
      SNAPSHOTTING: ["Awaiting confirmation", "Onay bekleniyor"],
      LOCKING: ["Locking", "Kilitleniyor"],
      LOCKED: ["Locked", "Kilitli"],
      RESTARTING: ["Restart pending", "Yeniden başlatma bekleniyor"],
      VERIFYING: ["Verifying", "Doğrulanıyor"],
      RESTORING: ["Restoring", "Geri yükleniyor"],
      COMPLETED: ["Completed", "Tamamlandı"],
      PARTIAL_FAILURE: ["Partial failure", "Kısmi hata"],
      MANUAL_RECOVERY_REQUIRED: [
        "Manual recovery required",
        "Elle kurtarma gerekiyor",
      ],
    };
    rendered +=
      "========================================\n             ULTIMATE GUARD\n";
    rendered += `       ${language === "tr" ? "Casi tarafından geliştirildi" : "Developed by Casi"}\n========================================\n`;
    for (const [key, tr, en] of labels) {
      const value = summary[key];
      if (typeof value !== "string" && typeof value !== "number") continue;
      const translated = String(value)
        .split(",")
        .map((value) => {
          const token = value.trim();
          return Object.hasOwn(statuses, token)
            ? statuses[token]![language === "tr" ? 1 : 0]
            : clean(token, 120);
        })
        .join(", ");
      rendered += `${(language === "tr" ? tr : en).padEnd(22)} ${translated || "—"}\n`;
    }
    rendered += `${(language === "tr" ? "Günlük biçimi" : "Log format").padEnd(22)} ${options.format ?? "pretty"}\n`;
    rendered += `${(language === "tr" ? "Konsol dili" : "Console language").padEnd(22)} ${language === "tr" ? "Türkçe" : "English"}\n========================================\n`;
  }
  return rendered;
}
