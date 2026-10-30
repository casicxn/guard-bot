import type { BackupService, Incident, Store } from "../contracts.js";
import { UserError } from "../discord/errors.js";
import type { ManagementActor, OwnerAuthorization } from "./contracts.js";

export function assertManagementActor(actor: ManagementActor): void {
  if (
    !actor ||
    !actor.authorization ||
    typeof actor.authorization.assertOwner !== "function"
  )
    throw new UserError("error.owner");
  actor.authorization.assertOwner(actor.userId);
}

/** Private UI-facing repository boundary; automated protection keeps using the original repository. */
export function ownerGuildStore(
  store: Store,
  authorization: OwnerAuthorization,
  actorId: string,
  guildId: string,
): Store {
  authorization.assertOwner(actorId);
  const guard = (targetGuildId: string): void => {
    authorization.assertOwner(actorId);
    if (targetGuildId !== guildId) throw new UserError("error.invalidRoute");
  };
  return {
    getConfig(g) {
      guard(g);
      return store.getConfig(g);
    },
    setConfig(g, config) {
      guard(g);
      store.setConfig(g, config);
    },
    get<T>(g: string, collection: string, id: string): T | undefined {
      guard(g);
      return store.get<T>(g, collection, id);
    },
    put<T>(g: string, collection: string, id: string, value: T): void {
      guard(g);
      store.put(g, collection, id, value);
    },
    list<T>(
      g: string,
      collection: string,
      limit?: number,
      offset?: number,
    ): T[] {
      guard(g);
      return store.list<T>(g, collection, limit, offset);
    },
    delete(g, collection, id) {
      guard(g);
      store.delete(g, collection, id);
    },
    claim(g, key) {
      guard(g);
      return store.claim(g, key);
    },
    claimIncident: store.claimIncident
      ? (incident: Incident) => {
          guard(incident.guildId);
          return store.claimIncident!(incident);
        }
      : undefined,
    close() {
      authorization.assertOwner(actorId);
      throw new UserError("error.invalidRoute");
    },
  };
}

/** Manual backup operations need owner authorization; scheduled/internal operations use the raw service. */
export function ownerBackupService(
  backup: BackupService,
  authorization: OwnerAuthorization,
  actorId: string,
  guildId: string,
): BackupService {
  authorization.assertOwner(actorId);
  const guard = (targetGuildId: string): void => {
    authorization.assertOwner(actorId);
    if (targetGuildId !== guildId) throw new UserError("error.invalidRoute");
  };
  return {
    async create(g) {
      guard(g);
      return backup.create(g);
    },
    list(g) {
      guard(g);
      return backup.list(g);
    },
    async preview(g, id, scope) {
      guard(g);
      return backup.preview(g, id, scope);
    },
    async restore(g, id, scope) {
      guard(g);
      return backup.restore(g, id, scope);
    },
  };
}
