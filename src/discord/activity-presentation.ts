import type { Incident } from "../contracts.js";
import { t, type Language } from "../locales/index.js";
import { ACTIVITY_INDICATORS, classifyActivity } from "../security/activity.js";
/** Shared public activity entries use indicators; one embed still has only one primary color. */
export function recentActivityText(
  language: Language,
  records: Incident[],
  limit = 3,
): string {
  return (
    [...records]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((incident) => {
        const kind = classifyActivity(incident);
        return t(language, "activity.recentLine", {
          indicator: ACTIVITY_INDICATORS[kind],
          status: t(language, `activity.class.${kind}`),
          action: t(
            language,
            `activity.action.${incident.event.action === "role.permissions" && incident.event.auditAction === 30 ? "role.create" : incident.event.action}`,
          ),
          time: `<t:${Math.floor(incident.createdAt / 1000)}:R>`,
        });
      })
      .join("\n") || t(language, "common.none")
  );
}
