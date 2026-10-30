import type {
  ActorContext,
  EnforcementAdapter,
  Incident,
  ModuleConfig,
  SecurityEvent,
  SecurityProcessor,
  Store,
  WhitelistEntry,
} from "../contracts.js";
import { MODULES } from "./modules.js";
import { whitelistSchema } from "../configuration/index.js";
import { matchingWhitelistExemption } from "./activity.js";
export {
  MODULES,
  defaultModules,
  actionForAudit,
  dangerousPermissionGrant,
  DANGEROUS_PERMISSIONS,
} from "./modules.js";
export { correlateAudit } from "./correlation.js";
export function isWhitelisted(
  entries: WhitelistEntry[],
  event: SecurityEvent,
  actor: ActorContext,
  now: number,
): boolean {
  return entries
    .map((e) => whitelistSchema.parse(e))
    .some(
      (e) =>
        (e.expiresAt === undefined || e.expiresAt > now) &&
        (e.actions.includes(event.action) || e.actions.includes("*")) &&
        ((e.kind === "user" &&
          !actor.isBot &&
          e.subjectId === event.executorId) ||
          (e.kind === "bot" &&
            actor.isBot &&
            e.subjectId === event.executorId) ||
          (e.kind === "role" && actor.roleIds.includes(e.subjectId))),
    );
}
function validPolicy(p: ModuleConfig): boolean {
  return (
    Number.isInteger(p.threshold) &&
    p.threshold >= 1 &&
    p.threshold <= 10000 &&
    Number.isFinite(p.windowMs) &&
    p.windowMs >= 1000 &&
    p.windowMs <= 86400000 &&
    ["monitor", "protect"].includes(p.mode) &&
    ["log", "warn", "strip", "kick", "ban", "lockdown", "reverse"].includes(
      p.action,
    )
  );
}
export class SecurityEngine implements SecurityProcessor {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly rollbackTargets = new Set<string>();
  private readonly rollbackJobs: {
    target: string;
    run: () => Promise<void>;
  }[] = [];
  private readonly background = new Set<Promise<void>>();
  private readonly notifications = new Set<Promise<void>>();
  constructor(
    private readonly store: Store,
    private readonly adapter: EnforcementAdapter,
    private readonly now: () => number = Date.now,
  ) {}
  process(event: SecurityEvent): Promise<Incident | undefined> {
    const previous = this.queues.get(event.guildId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.processOne(event));
    this.queues.set(event.guildId, next);
    void next
      .finally(() => {
        if (this.queues.get(event.guildId) === next)
          this.queues.delete(event.guildId);
      })
      .catch(() => undefined);
    return next;
  }
  async drain(): Promise<void> {
    while (
      this.queues.size ||
      this.background.size ||
      this.rollbackJobs.length ||
      this.notifications.size
    ) {
      await Promise.allSettled([
        ...this.queues.values(),
        ...this.background,
        ...this.notifications,
      ]);
    }
  }
  private notify(incident: Incident): void {
    if (this.notifications.size >= 1000) return; // Durable incidents remain available when delivery is saturated.
    const task = Promise.resolve()
      .then(() => this.adapter.log(structuredClone(incident)))
      .catch(() => undefined);
    this.notifications.add(task);
    void task.finally(() => this.notifications.delete(task));
  }
  private pumpRollback(): void {
    while (this.background.size < 4) {
      const index = this.rollbackJobs.findIndex(
        (job) => !this.rollbackTargets.has(job.target),
      );
      if (index < 0) return;
      const job = this.rollbackJobs.splice(index, 1)[0]!;
      this.rollbackTargets.add(job.target);
      const task = Promise.resolve()
        .then(job.run)
        .catch(() => undefined);
      this.background.add(task);
      void task.finally(() => {
        this.background.delete(task);
        this.rollbackTargets.delete(job.target);
        this.pumpRollback();
      });
    }
  }
  private exempt(event: SecurityEvent, actor: ActorContext): boolean {
    return (
      event.executorId === actor.ownerId ||
      event.executorId === actor.selfId ||
      (!!actor.botOwnerId && event.executorId === actor.botOwnerId) ||
      isWhitelisted(
        this.store.list<WhitelistEntry>(event.guildId, "whitelist"),
        event,
        actor,
        this.now(),
      )
    );
  }
  private async protect(
    event: SecurityEvent,
    incident: Incident,
  ): Promise<void> {
    const save = () =>
      this.store.put(event.guildId, "incidents", incident.id, incident);
    const allowed = async (): Promise<boolean> => {
      const actor = await this.adapter.context(event);
      const config = this.store.getConfig(event.guildId);
      return (
        config.mode === "protect" &&
        config.zeroTolerance === true &&
        (config.protectionActivatedAt === undefined ||
          event.timestamp >= config.protectionActivatedAt) &&
        this.now() - event.timestamp >= -5000 &&
        this.now() - event.timestamp <= 60000 &&
        !this.exempt(event, actor)
      );
    };
    if (!(await allowed())) return;
    const guard = this.store.get<{ blockedSince: number }>(
      event.guildId,
      "recovery_guard",
      "main",
    );
    this.store.put(event.guildId, "recovery_guard", "main", {
      blockedSince: Math.min(
        guard?.blockedSince ?? event.timestamp,
        event.timestamp,
      ),
      eventId: event.id,
    });
    incident.policy = "contain-rollback";
    incident.enforcementAttempted = true;
    incident.status = "pending";
    incident.result = "Zero-tolerance decision persisted; containment pending";
    save();
    this.store.put(event.guildId, "incident_processing", event.id, {
      state: "containing",
      eventId: event.id,
      updatedAt: this.now(),
    });
    try {
      if (!this.adapter.contain)
        throw new Error("Containment adapter unavailable");
      incident.containment = await this.adapter.contain(event);
    } catch (error) {
      incident.containment = {
        status: "failed",
        removedRoleIds: [],
        remainingRoleIds: [],
        remainingPermissions: "unknown",
        reason:
          error instanceof Error
            ? error.message
            : "Containment dependency failed",
      };
    }
    this.store.put(event.guildId, "containment_records", event.executorId!, {
      executorId: event.executorId,
      eventId: event.id,
      updatedAt: this.now(),
      ...incident.containment,
    });
    incident.result = `Containment ${incident.containment.status}: ${incident.containment.reason}`;
    if (incident.containment.status === "exempt") {
      incident.status = "exempt";
      this.store.put(event.guildId, "incident_processing", event.id, {
        state: "exempt",
        eventId: event.id,
        updatedAt: this.now(),
      });
      save();
      return;
    }
    incident.status =
      incident.containment.status === "contained" ? "pending" : "degraded";
    if (incident.containment.status !== "contained")
      incident.event.severity = "critical";
    // Rollback runs separately: another executor's containment never waits on restoration.
    if (this.rollbackJobs.length >= 1000) {
      incident.rollback = {
        status: "skipped",
        strategy: "queue",
        result: "Rollback queue capacity reached; manual recovery required",
      };
      incident.status = "degraded";
      incident.result += "\nRollback skipped: queue capacity reached";
      this.store.put(event.guildId, "incident_processing", event.id, {
        state: "degraded",
        eventId: event.id,
        updatedAt: this.now(),
      });
      save();
      return;
    }
    this.store.put(event.guildId, "incident_processing", event.id, {
      state: "rollback-queued",
      eventId: event.id,
      updatedAt: this.now(),
    });
    save();
    this.rollbackJobs.push({
      target: `${event.guildId}:${event.targetId}`,
      run: async () => {
        try {
          this.store.put(event.guildId, "incident_processing", event.id, {
            state: "rolling-back",
            eventId: event.id,
            updatedAt: this.now(),
          });
          if (!(await allowed()))
            incident.rollback = {
              status: "skipped",
              strategy: "authorization",
              result:
                "Protection mode or executor authorization changed; rollback skipped",
            };
          else if (!this.adapter.rollback)
            incident.rollback = {
              status: "unsupported",
              strategy: "none",
              result: "Rollback adapter unavailable; manual recovery required",
            };
          else incident.rollback = await this.adapter.rollback(event, allowed);
        } catch (error) {
          incident.rollback = {
            status: "failed",
            strategy: "dependency",
            result:
              error instanceof Error
                ? error.message
                : "Rollback dependency failed",
          };
        }
        incident.status =
          incident.containment?.status === "contained" &&
          incident.rollback.status === "succeeded"
            ? "handled"
            : "degraded";
        incident.result = `Containment ${incident.containment?.status}: ${incident.containment?.reason}\nRollback ${incident.rollback.status}: ${incident.rollback.result}`;
        this.store.put(event.guildId, "incident_processing", event.id, {
          state: incident.status,
          eventId: event.id,
          updatedAt: this.now(),
        });
        save();
        this.notify(incident);
      },
    });
    this.pumpRollback();
  }
  private async processOne(
    event: SecurityEvent,
  ): Promise<Incident | undefined> {
    const module = MODULES.find((m) => m.id === event.action);
    if (!module || !event.id || !event.guildId) return undefined;
    const config = this.store.getConfig(event.guildId);
    const policy = config.modules[event.action];
    if (
      !policy ||
      (!policy.enabled &&
        !(
          (module.administrative && config.zeroTolerance) ||
          (module.auditActions.length && config.mode === "monitor")
        ))
    )
      return undefined;
    // Atomic incident + dedupe storage is used by SQLite below.
    const now = this.now();
    const confirmed =
      event.source === "audit" &&
      Boolean(event.targetId && event.executorId) &&
      event.auditAction !== undefined &&
      module.auditActions.includes(event.auditAction) &&
      Number.isFinite(event.timestamp) &&
      now - event.timestamp >= -5000 &&
      now - event.timestamp <= 60000;
    const incident: Incident = {
      id: event.id,
      guildId: event.guildId,
      event: { ...event, severity: module.severity },
      createdAt: now,
      enforcementAttempted: false,
      confidence: confirmed ? "confirmed" : "unresolved",
      policy: policy.action,
      status: "recorded",
      result: "Monitor only",
    };
    const save = () =>
      this.store.put(event.guildId, "incidents", incident.id, incident);
    if (this.store.claimIncident) {
      if (!this.store.claimIncident(incident)) return undefined;
    } else {
      if (!this.store.claim(event.guildId, `security:${event.id}`))
        return undefined;
      save();
    } // No effects before durable storage succeeds.
    try {
      if (!confirmed)
        incident.result = "Unresolved attribution: no enforcement";
      else if (!config.zeroTolerance && !validPolicy(policy)) {
        incident.status = "degraded";
        incident.result = "Invalid policy: no enforcement";
      } else {
        const actor = await this.adapter.context(event);
        if (
          event.executorId === actor.ownerId ||
          event.executorId === actor.selfId ||
          (!!actor.botOwnerId && event.executorId === actor.botOwnerId)
        ) {
          incident.status = "exempt";
          incident.result = "Protected owner or bot self-action";
          incident.exemption =
            event.executorId === actor.selfId
              ? "self"
              : event.executorId === actor.botOwnerId
                ? "botOwner"
                : "guildOwner";
          await this.adapter.observeTrusted?.(event);
        } else if (
          isWhitelisted(
            this.store.list<WhitelistEntry>(event.guildId, "whitelist"),
            event,
            actor,
            now,
          )
        ) {
          incident.status = "exempt";
          incident.result = "Action-specific whitelist";
          incident.exemption =
            matchingWhitelistExemption(
              this.store.list<WhitelistEntry>(event.guildId, "whitelist"),
              event,
              actor,
              now,
            ) ?? "policy";
          await this.adapter.observeTrusted?.(event);
        } else if (
          config.zeroTolerance &&
          config.protectionActivatedAt !== undefined &&
          event.timestamp < config.protectionActivatedAt
        ) {
          // Exemptions remain visible; delayed Monitor actions still never authorize effects.
          incident.result = "Monitor only";
        } else if (
          config.zeroTolerance &&
          config.mode === "protect" &&
          module.administrative
        ) {
          await this.protect(event, incident);
        } else if (config.zeroTolerance && !module.administrative) {
          incident.result = "Monitor only";
        } else {
          const counterId = `${event.action}:${event.executorId}`;
          const timestamps = (
            this.store.get<number[]>(event.guildId, "counters", counterId) ?? []
          ).filter((t) => t > now - policy.windowMs && t <= now);
          if (event.timestamp > now - policy.windowMs)
            timestamps.push(Math.min(now, event.timestamp));
          this.store.put(
            event.guildId,
            "counters",
            counterId,
            timestamps.slice(-policy.threshold),
          );
          if (timestamps.length < policy.threshold)
            incident.result = `Below threshold (${timestamps.length}/${policy.threshold})`;
          else {
            const refreshedActor = await this.adapter.context(event);
            const fresh = this.store.getConfig(event.guildId);
            const p = fresh.modules[event.action];
            if (
              fresh.mode === "protect" &&
              p?.enabled &&
              p.mode === "protect" &&
              validPolicy(p) &&
              p.action === policy.action &&
              p.threshold === policy.threshold &&
              p.windowMs === policy.windowMs &&
              event.executorId !== refreshedActor.ownerId &&
              event.executorId !== refreshedActor.selfId &&
              (!refreshedActor.botOwnerId ||
                event.executorId !== refreshedActor.botOwnerId) &&
              !isWhitelisted(
                this.store.list<WhitelistEntry>(event.guildId, "whitelist"),
                event,
                refreshedActor,
                this.now(),
              ) &&
              policy.action !== "log"
            ) {
              incident.status = "pending";
              incident.enforcementAttempted = true;
              incident.result = "Decision persisted; enforcement pending";
              save();
              incident.result = await this.adapter.enforce(
                event,
                policy.action,
              );
              incident.status = "handled";
            }
          }
        }
      }
    } catch (error) {
      incident.status = "failed";
      incident.result =
        error instanceof Error ? error.message : "Security dependency failed";
    }
    save();
    if (config.zeroTolerance && module.auditActions.length) {
      this.notify(incident);
      return incident;
    }
    try {
      await this.adapter.log(incident);
    } catch {
      /* Durable incident survives log delivery failure. */
    }
    return incident;
  }
}
