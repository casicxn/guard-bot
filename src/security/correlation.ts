import type { SecurityEvent } from "../contracts.js";
import { MODULES } from "./modules.js";
export interface CorrelationOptions {
  attempts?: number;
  delayMs?: number;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}
/** Ambiguous action/target matches never resolve by proximity alone. */
export async function correlateAudit(
  event: SecurityEvent,
  fetch: () => Promise<SecurityEvent[]>,
  options: CorrelationOptions = {},
): Promise<SecurityEvent | undefined> {
  if (!event.targetId) return undefined;
  const attempts = Math.min(4, Math.max(1, options.attempts ?? 3));
  const windowMs = Math.min(30000, Math.max(1, options.windowMs ?? 10000));
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const module = MODULES.find((m) => m.id === event.action);
  for (let i = 0; i < attempts; i++) {
    let entries: SecurityEvent[];
    try {
      entries = await fetch();
    } catch {
      entries = [];
    }
    const candidates = entries.filter(
      (e) =>
        e.source === "audit" &&
        e.guildId === event.guildId &&
        e.action === event.action &&
        e.targetId === event.targetId &&
        e.executorId &&
        (!event.executorId || event.executorId === e.executorId) &&
        e.auditAction !== undefined &&
        module?.auditActions.includes(e.auditAction) &&
        Math.abs(e.timestamp - event.timestamp) <= windowMs &&
        Math.abs(now() - e.timestamp) <= 60000,
    );
    const unique = [...new Map(candidates.map((e) => [e.id, e])).values()];
    if (unique.length === 1) return unique[0];
    if (unique.length > 1) return undefined;
    if (i < attempts - 1)
      await sleep(Math.min(2000, Math.max(0, options.delayMs ?? 500)));
  }
  return undefined;
}
