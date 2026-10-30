import { createHash, randomBytes } from "node:crypto";
import { PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import type { Logger } from "pino";
import type { Store } from "../contracts.js";
import type { OwnerAuthorization } from "../control/contracts.js";
import { UserError } from "../discord/errors.js";
import { acquireRecoveryOperation } from "../recovery/index.js";
import { DANGEROUS_PERMISSIONS } from "../security/modules.js";
import type { RestartAdapter, RestartRole } from "./adapter.js";
import type {
  RestartProtection,
  RestartRoleSnapshot,
  RestartSession,
  RestartState,
} from "./contracts.js";
export { createDiscordRestartAdapter } from "./adapter.js";
export type { RestartAdapter, RestartGuild, RestartRole } from "./adapter.js";
export type {
  RestartProtection,
  RestartSession,
  RestartRoleSnapshot,
  RestartState,
} from "./contracts.js";
const states = [
  "IDLE",
  "PREPARING",
  "SNAPSHOTTING",
  "LOCKING",
  "LOCKED",
  "RESTARTING",
  "VERIFYING",
  "RESTORING",
  "COMPLETED",
  "PARTIAL_FAILURE",
  "MANUAL_RECOVERY_REQUIRED",
] as const;
const decimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})$/)
  .refine((value) => BigInt(value) <= (1n << 64n) - 1n);
const roleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string(),
  originalPermissions: decimal,
  removedPermissions: decimal,
  lockedPermissions: decimal,
  actualPermissions: decimal.optional(),
  position: z.number().int().nonnegative(),
  manageable: z.boolean(),
  status: z.enum([
    "planned",
    "pending",
    "locked",
    "restored",
    "unchanged",
    "conflict",
    "missing",
    "failed",
    "uncertain",
    "skipped",
  ]),
  error: z.string().optional(),
});
const sessionSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-f0-9]{24}$/),
  guildId: z.string().min(1),
  initiatedBy: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  originalMode: z.enum(["monitor", "protect"]),
  state: z.enum(states),
  roles: z.array(roleSchema).max(1000),
  risks: z.array(z.string()),
  canActivate: z.boolean(),
  transitions: z.array(
    z.object({ state: z.enum(states), at: z.number().int().nonnegative() }),
  ),
});
interface Operation {
  version: 1;
  sessionId: string;
  guildId: string;
  roleId: string;
  kind: "lock" | "restore";
  previous: string;
  intended: string;
  applied?: string;
  status: "pending" | "verified" | "failed" | "conflict" | "uncertain";
  createdAt: number;
  updatedAt: number;
  error?: string;
}
const operationSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  guildId: z.string(),
  roleId: z.string(),
  kind: z.enum(["lock", "restore"]),
  previous: decimal,
  intended: decimal,
  applied: decimal.optional(),
  status: z.enum(["pending", "verified", "failed", "conflict", "uncertain"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  error: z.string().optional(),
});
const queues = new WeakMap<Store, Map<string, Promise<unknown>>>();
const terminal = (session: RestartSession) => session.state === "COMPLETED";
const safeError = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 500) : "Operation failed";
const planBody = (session: RestartSession) => ({
  id: session.id,
  guildId: session.guildId,
  initiatedBy: session.initiatedBy,
  createdAt: session.createdAt,
  originalMode: session.originalMode,
  roles: session.roles.map(
    ({
      roleId,
      name,
      originalPermissions,
      removedPermissions,
      lockedPermissions,
      position,
      manageable,
    }) => ({
      roleId,
      name,
      originalPermissions,
      removedPermissions,
      lockedPermissions,
      position,
      manageable,
    }),
  ),
});
const checksum = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isManageable = (role: RestartRole, highest: number) =>
  !role.managed && role.editable && role.position < highest && !role.botHeld;
const harmfulRisks = (risks: string[]) =>
  risks.some((risk) => risk !== "owner-unrestricted");
function canRestoreFlags(removed: string, botPermissions: string): boolean {
  const permissions = BigInt(decimal.parse(botPermissions));
  return (
    (permissions & PermissionFlagsBits.Administrator) !== 0n ||
    (BigInt(removed) & ~permissions) === 0n
  );
}

export function createRestartProtection(
  store: Store,
  authorization: OwnerAuthorization,
  adapter: RestartAdapter,
  logger: Logger,
  options: {
    guardReady(guildId: string): Promise<boolean>;
    now?: () => number;
  },
): RestartProtection {
  const now = options.now ?? Date.now;
  let local = queues.get(store);
  if (!local) {
    local = new Map();
    queues.set(store, local);
  }
  const work = local;
  const recovered = new Map<string, Promise<RestartSession | undefined>>();
  async function guardReady(guildId: string): Promise<boolean> {
    try {
      return await options.guardReady(guildId);
    } catch (error) {
      logger.warn(
        { err: error, guildId, category: "RESTORE" },
        "Restart readiness verification failed",
      );
      return false;
    }
  }
  function run<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    const next = (work.get(guildId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    work.set(guildId, next);
    void next
      .finally(() => {
        if (work.get(guildId) === next) work.delete(guildId);
      })
      .catch(() => undefined);
    return next;
  }
  function save(session: RestartSession) {
    session.updatedAt = now();
    store.put(
      session.guildId,
      "restart_sessions",
      session.id,
      sessionSchema.parse(session),
    );
  }
  function transition(session: RestartSession, state: RestartState) {
    session.state = state;
    session.transitions.push({ state, at: now() });
    save(session);
    logger.info(
      {
        category:
          state === "RESTORING" || state === "COMPLETED"
            ? "RESTORE"
            : "LOCKDOWN",
        guildId: session.guildId,
        sessionId: session.id,
        state,
      },
      "Restart protection state changed",
    );
  }
  function validate(session: RestartSession) {
    if (
      new Set(session.roles.map((role) => role.roleId)).size !==
      session.roles.length
    )
      throw new UserError("restart.invalidJournal");
    for (const role of session.roles) {
      const original = BigInt(role.originalPermissions),
        removed = BigInt(role.removedPermissions),
        locked = BigInt(role.lockedPermissions);
      if (
        removed !== (original & DANGEROUS_PERMISSIONS) ||
        locked !== (original & ~removed)
      )
        throw new UserError("restart.invalidJournal");
    }
    const plan = store.get<{ body: unknown; digest: string }>(
      session.guildId,
      "restart_plans",
      session.id,
    );
    if (
      !plan ||
      plan.digest !== checksum(plan.body) ||
      plan.digest !== checksum(planBody(session))
    )
      throw new UserError("restart.invalidJournal");
  }
  function get(guildId: string): RestartSession | undefined {
    const active = store.get<{ sessionId: string }>(
      guildId,
      "restart_active",
      "main",
    );
    if (!active) return;
    const parsed = sessionSchema.safeParse(
      store.get(guildId, "restart_sessions", active.sessionId),
    );
    if (
      !parsed.success ||
      parsed.data.guildId !== guildId ||
      parsed.data.id !== active.sessionId
    )
      throw new UserError("restart.invalidJournal");
    const session: RestartSession = parsed.data;
    validate(session);
    return session;
  }
  function requested(guildId: string, id: string) {
    const session = get(guildId);
    if (!session || session.id !== id)
      throw new UserError("restart.staleSession");
    return session;
  }
  function operation(
    session: RestartSession,
    role: RestartRoleSnapshot,
    kind: "lock" | "restore",
  ): Operation | undefined {
    const raw = store.get(
      session.guildId,
      "restart_operations",
      `${session.id}:${kind}:${role.roleId}`,
    );
    if (raw === undefined) return;
    const parsed = operationSchema.safeParse(raw);
    if (!parsed.success) throw new UserError("restart.invalidJournal");
    const op: Operation = parsed.data;
    if (
      op.sessionId !== session.id ||
      op.guildId !== session.guildId ||
      op.roleId !== role.roleId ||
      op.kind !== kind ||
      op.previous !==
        (kind === "lock" ? role.originalPermissions : role.lockedPermissions) ||
      op.intended !==
        (kind === "lock" ? role.lockedPermissions : role.originalPermissions)
    )
      throw new UserError("restart.invalidJournal");
    return op;
  }
  function putOperation(session: RestartSession, op: Operation) {
    op.updatedAt = now();
    store.put(
      session.guildId,
      "restart_operations",
      `${session.id}:${op.kind}:${op.roleId}`,
      operationSchema.parse(op),
    );
  }
  async function setEffect(
    session: RestartSession,
    role: RestartRoleSnapshot,
    kind: "lock" | "restore",
    actorId?: string,
  ) {
    const previous =
        kind === "lock" ? role.originalPermissions : role.lockedPermissions,
      intended =
        kind === "lock" ? role.lockedPermissions : role.originalPermissions;
    let op = operation(session, role, kind);
    const current = await adapter.readRole(session.guildId, role.roleId);
    if (!current) {
      role.status = "missing";
      save(session);
      return;
    }
    role.actualPermissions = current.permissions;
    if (op) {
      // A journal means a prior request may already have reached Discord. Read, never replay it.
      if (current.permissions === intended) {
        role.status = kind === "lock" ? "locked" : "restored";
        op.status = "verified";
        op.applied = intended;
      } else if (current.permissions === previous) {
        role.status = kind === "lock" ? "unchanged" : "locked";
        op.status = op.status === "failed" ? "failed" : "uncertain";
        role.error =
          "A previous request has no verified effect; automatic replay is disabled";
      } else {
        role.status = "conflict";
        op.status = "conflict";
        role.error = "Current permissions differ from the recorded operation";
      }
      putOperation(session, op);
      save(session);
      return;
    }
    if (current.permissions !== previous) {
      role.status = "conflict";
      role.error = "Permissions changed since the recorded plan";
      save(session);
      return;
    }
    const live = await adapter.inspect(session.guildId);
    const liveRole = live.roles.find((entry) => entry.id === role.roleId);
    if (
      !live.manageRoles ||
      !liveRole ||
      !isManageable(liveRole, live.botHighestPosition) ||
      !canRestoreFlags(role.removedPermissions, live.botPermissions) ||
      liveRole.permissions !== previous
    ) {
      role.status = "conflict";
      role.error = "Role permissions or hierarchy changed";
      save(session);
      return;
    }
    if (kind === "restore") {
      if (!(await guardReady(session.guildId))) {
        role.status = "locked";
        role.error = "Guard readiness is not confirmed";
        save(session);
        return;
      }
      const principals = [
        ...new Set(
          store
            .list<{ executorId?: string; status?: string }>(
              session.guildId,
              "containment_records",
            )
            .filter((record) => record.status !== "exempt")
            .map((record) => record.executorId)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      if (
        await adapter.roleContainsContained(
          session.guildId,
          role.roleId,
          principals,
        )
      ) {
        role.status = "conflict";
        role.error = "Restoration would rearm a contained principal";
        save(session);
        return;
      }
    }
    if (actorId) authorization.assertOwner(actorId);
    if (kind === "restore" && !(await guardReady(session.guildId))) {
      role.status = "locked";
      role.error = "Guard readiness changed before restoration";
      save(session);
      return;
    }
    if (
      kind === "lock" &&
      store.getConfig(session.guildId).mode !== session.originalMode
    ) {
      role.status = "conflict";
      role.error = "Security mode changed during lockdown";
      save(session);
      return;
    }
    if (actorId) authorization.assertOwner(actorId);
    op = {
      version: 1,
      sessionId: session.id,
      guildId: session.guildId,
      roleId: role.roleId,
      kind,
      previous,
      intended,
      status: "pending",
      createdAt: now(),
      updatedAt: now(),
    };
    putOperation(session, op);
    // Read back durable state before any external mutation. A storage failure stops the operation.
    const persisted = operation(session, role, kind);
    if (!persisted || persisted.status !== "pending")
      throw new UserError("restart.invalidJournal");
    role.status = "pending";
    save(session);
    try {
      await adapter.setPermissions(
        session.guildId,
        role.roleId,
        intended,
        `Ultimate Guard restart ${kind} ${session.id}`,
        previous,
      );
      const verified = await adapter.readRole(session.guildId, role.roleId);
      if (verified?.permissions === intended) {
        op.status = "verified";
        op.applied = intended;
        role.actualPermissions = intended;
        role.status = kind === "lock" ? "locked" : "restored";
        delete role.error;
      } else {
        op.status = "uncertain";
        role.status = verified ? "conflict" : "missing";
        role.actualPermissions = verified?.permissions;
        role.error = "Discord result could not be verified";
      }
    } catch (error) {
      op.status = "uncertain";
      op.error = safeError(error);
      role.status = "uncertain";
      role.error = op.error;
      // A rejected promise is not proof of a rejected HTTP mutation. Verify observable state.
      try {
        const fresh = await adapter.readRole(session.guildId, role.roleId);
        if (fresh) {
          role.actualPermissions = fresh.permissions;
          if (fresh.permissions === intended) {
            op.status = "verified";
            op.applied = intended;
            role.status = kind === "lock" ? "locked" : "restored";
            delete role.error;
          } else if (fresh.permissions !== previous) {
            op.status = "conflict";
            role.status = "conflict";
          }
        }
      } catch {
        /* Keep uncertain journal. */
      }
      logger.warn(
        {
          err: error,
          guildId: session.guildId,
          roleId: role.roleId,
          category: kind === "restore" ? "RESTORE" : "LOCKDOWN",
        },
        "Restart permission operation needs review",
      );
    }
    putOperation(session, op);
    save(session);
  }
  async function restoreSession(
    session: RestartSession,
    actorId?: string,
  ): Promise<RestartSession> {
    if (terminal(session)) return session;
    transition(session, "VERIFYING");
    if (!(await guardReady(session.guildId))) {
      transition(session, "MANUAL_RECOVERY_REQUIRED");
      return session;
    }
    let release: () => void;
    try {
      release = acquireRecoveryOperation(store, session.guildId);
    } catch {
      throw new UserError("restart.busy");
    }
    try {
      transition(session, "RESTORING");
      for (const role of session.roles) {
        if (!role.manageable) {
          role.status = "skipped";
          continue;
        }
        const lock = operation(session, role, "lock");
        if (!lock) {
          role.status = "unchanged";
          continue;
        }
        const live = await adapter.readRole(session.guildId, role.roleId);
        if (!live) {
          role.status = "missing";
          save(session);
          continue;
        }
        role.actualPermissions = live.permissions;
        if (live.permissions === role.originalPermissions) {
          role.status = "restored";
          save(session);
          continue;
        }
        if (live.permissions !== role.lockedPermissions) {
          role.status = "conflict";
          role.error = "Permissions differ from locked and original snapshots";
          save(session);
          continue;
        }
        // Lock effect is proven by current intended state even after a crash before success was persisted.
        lock.status = "verified";
        lock.applied = role.lockedPermissions;
        putOperation(session, lock);
        await setEffect(session, role, "restore", actorId);
      }
      const unresolved = session.roles.some(
        (role) =>
          role.manageable && !["restored", "unchanged"].includes(role.status),
      );
      transition(
        session,
        unresolved ? "MANUAL_RECOVERY_REQUIRED" : "COMPLETED",
      );
      return session;
    } finally {
      release();
    }
  }
  return {
    get,
    prepare(actorId, guildId) {
      authorization.assertOwner(actorId);
      return run(guildId, async () => {
        authorization.assertOwner(actorId);
        const active = get(guildId);
        if (active && !terminal(active))
          throw new UserError("restart.activeSession");
        const session: RestartSession = {
          version: 1,
          id: randomBytes(12).toString("hex"),
          guildId,
          initiatedBy: actorId,
          createdAt: now(),
          updatedAt: now(),
          originalMode: store.getConfig(guildId).mode,
          state: "IDLE",
          roles: [],
          risks: [],
          canActivate: false,
          transitions: [{ state: "IDLE", at: now() }],
        };
        const emptyBody = planBody(session);
        store.put(guildId, "restart_plans", session.id, {
          body: emptyBody,
          digest: checksum(emptyBody),
        });
        save(session);
        store.put(guildId, "restart_active", "main", { sessionId: session.id });
        transition(session, "PREPARING");
        try {
          const live = await adapter.inspect(guildId);
          authorization.assertOwner(actorId);
          if (live.id !== guildId)
            throw new UserError("restart.invalidJournal");
          transition(session, "SNAPSHOTTING");
          session.risks = ["owner-unrestricted", ...live.overwriteRisks];
          for (const role of live.roles) {
            const original = BigInt(decimal.parse(role.permissions)),
              removed = original & DANGEROUS_PERMISSIONS;
            if (removed === 0n) continue;
            if (role.ownBotManaged) continue;
            const manageable = isManageable(role, live.botHighestPosition);
            if (!manageable)
              session.risks.push(
                `${role.botHeld ? "bot-shared" : "unmanageable"}:${role.id}`,
              );
            session.roles.push({
              roleId: role.id,
              name: role.name,
              originalPermissions: original.toString(),
              removedPermissions: removed.toString(),
              lockedPermissions: (original & ~removed).toString(),
              position: role.position,
              manageable,
              status: manageable ? "planned" : "skipped",
            });
          }
          session.canActivate = live.manageRoles;
          for (const role of session.roles) {
            if (
              role.manageable &&
              !canRestoreFlags(role.removedPermissions, live.botPermissions)
            ) {
              session.canActivate = false;
              session.risks.push(`cannot-restore:${role.roleId}`);
            }
          }
          if (!live.manageRoles) session.risks.push("missing-manage-roles");
          const body = planBody(session);
          store.put(guildId, "restart_plans", session.id, {
            body,
            digest: checksum(body),
          });
          save(session);
          validate(get(guildId)!);
          return session;
        } catch (error) {
          session.canActivate = false;
          session.risks.push("preflight-failed");
          const body = planBody(session);
          store.put(guildId, "restart_plans", session.id, {
            body,
            digest: checksum(body),
          });
          transition(session, "MANUAL_RECOVERY_REQUIRED");
          throw error;
        }
      });
    },
    activate(actorId, guildId, sessionId) {
      authorization.assertOwner(actorId);
      return run(guildId, async () => {
        authorization.assertOwner(actorId);
        const session = requested(guildId, sessionId);
        if (session.state === "LOCKED" || session.state === "PARTIAL_FAILURE")
          return session;
        if (session.state !== "SNAPSHOTTING" || !session.canActivate)
          throw new UserError("restart.unsafePlan");
        const live = await adapter.inspect(guildId);
        authorization.assertOwner(actorId);
        if (
          !live.manageRoles ||
          store.getConfig(guildId).mode !== session.originalMode
        )
          throw new UserError("restart.staleSession");
        for (const role of session.roles) {
          const fresh = live.roles.find((item) => item.id === role.roleId);
          if (
            role.manageable &&
            (!fresh ||
              fresh.permissions !== role.originalPermissions ||
              !isManageable(fresh, live.botHighestPosition) ||
              !canRestoreFlags(role.removedPermissions, live.botPermissions))
          )
            throw new UserError("restart.staleSession");
        }
        const currentRisks = [
          ...live.overwriteRisks,
          ...live.roles
            .filter(
              (role) =>
                (BigInt(role.permissions) & DANGEROUS_PERMISSIONS) !== 0n &&
                !role.ownBotManaged &&
                !isManageable(role, live.botHighestPosition),
            )
            .map(
              (role) =>
                `${role.botHeld ? "bot-shared" : "unmanageable"}:${role.id}`,
            ),
        ];
        const known = new Set(session.roles.map((role) => role.roleId));
        if (
          live.roles.some(
            (role) =>
              !role.ownBotManaged &&
              !known.has(role.id) &&
              (BigInt(role.permissions) & DANGEROUS_PERMISSIONS) !== 0n,
          )
        )
          throw new UserError("restart.staleSession");
        session.risks = [...new Set([...session.risks, ...currentRisks])];
        let release: () => void;
        try {
          release = acquireRecoveryOperation(store, guildId);
        } catch {
          throw new UserError("restart.busy");
        }
        try {
          transition(session, "LOCKING");
          for (const role of session.roles) {
            authorization.assertOwner(actorId);
            if (role.manageable)
              await setEffect(session, role, "lock", actorId);
          }
          transition(session, "VERIFYING");
          const final = await adapter.inspect(guildId);
          let uncovered = final.overwriteRisks.length > 0;
          for (const role of session.roles)
            if (role.manageable) {
              const fresh = final.roles.find((item) => item.id === role.roleId);
              role.actualPermissions = fresh?.permissions;
              if (fresh?.permissions !== role.lockedPermissions) {
                role.status = fresh ? "conflict" : "missing";
                uncovered = true;
              }
            }
          const coverage = final.roles.some(
            (role) =>
              !role.ownBotManaged &&
              (BigInt(role.permissions) & DANGEROUS_PERMISSIONS) !== 0n,
          );
          transition(
            session,
            uncovered || coverage || harmfulRisks(session.risks)
              ? "PARTIAL_FAILURE"
              : "LOCKED",
          );
          return session;
        } finally {
          release();
        }
      });
    },
    restore(actorId, guildId, sessionId) {
      authorization.assertOwner(actorId);
      return run(guildId, async () => {
        authorization.assertOwner(actorId);
        return restoreSession(requested(guildId, sessionId), actorId);
      });
    },
    cancel(actorId, guildId, sessionId) {
      authorization.assertOwner(actorId);
      return run(guildId, async () => {
        authorization.assertOwner(actorId);
        const session = requested(guildId, sessionId);
        const changed = session.roles.some((role) =>
          operation(session, role, "lock"),
        );
        if (changed) throw new UserError("restart.unsafePlan");
        transition(session, "COMPLETED");
        return session;
      });
    },
    recover(guildId) {
      let task = recovered.get(guildId);
      if (!task) {
        task = run(guildId, async () => {
          const session = get(guildId);
          if (!session || terminal(session)) return session;
          const mutations = session.roles.some((role) =>
            operation(session, role, "lock"),
          );
          if (!mutations) {
            transition(session, "MANUAL_RECOVERY_REQUIRED");
            return session;
          }
          transition(session, "RESTARTING");
          return restoreSession(session);
        });
        recovered.set(guildId, task);
      }
      return task;
    },
    async drain() {
      while (work.size) await Promise.allSettled([...work.values()]);
    },
  };
}
