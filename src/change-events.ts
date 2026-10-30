import type { Store } from "./contracts.js";
export interface StoreChange {
  guildId: string;
  collection: string;
}
const listeners = new WeakMap<Store, Set<(change: StoreChange) => void>>();
export function subscribeChanges(
  store: Store,
  listener: (change: StoreChange) => void,
): () => void {
  const entries = listeners.get(store) ?? new Set();
  entries.add(listener);
  listeners.set(store, entries);
  return () => {
    entries.delete(listener);
  };
}
/** Notifications are advisory; a UI failure must never fail a durable security write. */
export function publishChange(
  store: Store,
  guildId: string,
  collection: string,
): void {
  for (const listener of listeners.get(store) ?? [])
    try {
      listener({ guildId, collection });
    } catch {
      /* Isolate optional subscribers. */
    }
}
