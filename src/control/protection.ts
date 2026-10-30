import {
  GatewayIntentBits,
  PermissionFlagsBits,
  type Client,
} from "discord.js";
import type { GuildConfig, Mode, ModuleConfig, Store } from "../contracts.js";
import type { OwnerAuthorization } from "./contracts.js";
import { MODULES } from "../security/modules.js";
import { UserError } from "../discord/errors.js";
import {
  findKnownGoodSnapshot,
  prepareProtectionBaseline,
} from "../recovery/known-good.js";

export interface ModuleAvailability {
  id: string;
  available: boolean;
  missing: string[];
}
export interface ProtectionHealth {
  mode: Mode;
  zeroTolerance: boolean;
  eligible: number;
  active: number;
  unavailable: ModuleAvailability[];
  modules: ModuleAvailability[];
  auditReady: boolean;
  snapshotReady: boolean;
}
interface Preferences {
  version: 1;
  savedAt: number;
  modules: Record<string, ModuleConfig>;
  originalModules?: Record<string, ModuleConfig>;
}
const eligible = MODULES.filter((module) => module.administrative);
const operationStates = new WeakMap<
  Store,
  { queues: Map<string, Promise<unknown>>; generations: Map<string, number> }
>();
function requiredPermissions(id: string): Array<[string, bigint]> {
  const permissions: Array<[string, bigint]> = [
    ["ViewAuditLog", PermissionFlagsBits.ViewAuditLog],
    ["ManageRoles", PermissionFlagsBits.ManageRoles],
  ];
  const strategy = MODULES.find((module) => module.id === id)?.rollback;
  if (strategy === "unsupported" || strategy === "manual-rejoin")
    return permissions;
  if (id.startsWith("channel."))
    permissions.push(["ManageChannels", PermissionFlagsBits.ManageChannels]);
  if (id.startsWith("guild.") || id.startsWith("automod."))
    permissions.push(["ManageGuild", PermissionFlagsBits.ManageGuild]);
  if (id === "member.ban" || id === "member.unban")
    permissions.push(["BanMembers", PermissionFlagsBits.BanMembers]);
  if (id.startsWith("webhook."))
    permissions.push(["ManageWebhooks", PermissionFlagsBits.ManageWebhooks]);
  if (id.startsWith("emoji.") || id.startsWith("sticker."))
    permissions.push([
      "ManageGuildExpressions",
      PermissionFlagsBits.ManageGuildExpressions,
    ]);
  if (id.startsWith("event."))
    permissions.push(["ManageEvents", PermissionFlagsBits.ManageEvents]);
  if (id.startsWith("thread."))
    permissions.push(["ManageThreads", PermissionFlagsBits.ManageThreads]);
  if (id.startsWith("soundboard."))
    permissions.push([
      "ManageGuildExpressions",
      PermissionFlagsBits.ManageGuildExpressions,
    ]);
  return permissions;
}
export function createProtectionControl(
  client: Client,
  store: Store,
  authorization: OwnerAuthorization,
) {
  const operations = operationStates.get(store) ?? {
    queues: new Map<string, Promise<unknown>>(),
    generations: new Map<string, number>(),
  };
  operationStates.set(store, operations);
  const { queues, generations } = operations;
  async function health(guildId: string): Promise<ProtectionHealth> {
    const config = store.getConfig(guildId);
    let has = (permission: bigint): boolean => {
      void permission;
      return false;
    };
    try {
      const guild = await client.guilds.fetch({ guild: guildId, force: true });
      const me = await guild.members.fetchMe({ force: true });
      has = (permission) => me.permissions.has(permission);
    } catch {
      /* Failed permission reads report unavailable instead of claiming complete protection. */
    }
    const intent = Boolean(
      client.options.intents.has(GatewayIntentBits.GuildModeration),
    );
    const guildsIntent = Boolean(
      client.options.intents.has(GatewayIntentBits.Guilds),
    );
    const modules = eligible.map((module) => ({
      id: module.id,
      available: true,
      missing: [
        ...requiredPermissions(module.id)
          .filter(([, permission]) => !has(permission))
          .map(([key]) => key),
        ...(!intent ? ["GuildModeration"] : []),
        ...(!guildsIntent ? ["Guilds"] : []),
      ],
    }));
    for (const module of modules)
      module.available = module.missing.length === 0;
    const zeroTolerance =
      config.mode === "protect" && config.zeroTolerance === true;
    let snapshotReady = false;
    try {
      snapshotReady = Boolean(findKnownGoodSnapshot(store, guildId));
    } catch {
      /* Unreadable/corrupt snapshots cannot count as ready. */
    }
    return {
      mode: config.mode,
      zeroTolerance,
      eligible: eligible.length,
      active: zeroTolerance
        ? modules.filter((module) => module.available).length
        : 0,
      unavailable: modules.filter((module) => !module.available),
      modules,
      auditReady:
        has(PermissionFlagsBits.ViewAuditLog) && intent && guildsIntent,
      snapshotReady,
    };
  }
  return {
    health,
    async setMode(
      actorId: string,
      guildId: string,
      mode: Mode,
      expectedConfig?: string,
    ): Promise<ProtectionHealth> {
      authorization.assertOwner(actorId);
      if (mode !== "monitor" && mode !== "protect")
        throw new UserError("panel.invalidChoice");
      if (mode === "monitor") {
        const current = store.getConfig(guildId);
        if (
          expectedConfig !== undefined &&
          JSON.stringify(current) !== expectedConfig
        )
          throw new UserError("control.stale");
        const next = structuredClone(current),
          existing = store.get<Preferences>(
            guildId,
            "protection_preferences",
            "main",
          );
        if (current.zeroTolerance && existing?.version === 1)
          next.modules = structuredClone(existing.modules);
        for (const module of eligible) {
          const previous =
            next.modules[module.id] ?? current.modules[module.id];
          if (previous)
            next.modules[module.id] = {
              ...previous,
              enabled: true,
              mode: "monitor",
            };
        }
        next.mode = "monitor";
        next.zeroTolerance = true;
        authorization.assertOwner(actorId);
        generations.set(guildId, (generations.get(guildId) ?? 0) + 1);
        store.setConfig(guildId, next);
        return health(guildId);
      }
      const generation = generations.get(guildId) ?? 0;
      const task = (queues.get(guildId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          authorization.assertOwner(actorId);
          if ((generations.get(guildId) ?? 0) !== generation)
            throw new UserError("control.stale");
          const current = store.getConfig(guildId);
          const captured = JSON.stringify(current);
          if (
            expectedConfig !== undefined &&
            JSON.stringify(current) !== expectedConfig
          )
            throw new UserError("control.stale");
          const next: GuildConfig = structuredClone(current);
          const existing = store.get<Preferences>(
            guildId,
            "protection_preferences",
            "main",
          );
          // Save preferences only on transition, never replace them with the forced profile.
          if (current.mode !== "protect" || !current.zeroTolerance)
            store.put<Preferences>(guildId, "protection_preferences", "main", {
              version: 1,
              savedAt: Date.now(),
              modules: structuredClone(current.modules),
              originalModules: structuredClone(
                existing?.originalModules ??
                  existing?.modules ??
                  current.modules,
              ),
            });
          if (!(current.mode === "protect" && current.zeroTolerance))
            try {
              await prepareProtectionBaseline(client, store, guildId);
            } catch {
              /* Protection may be activated with an explicitly unavailable snapshot baseline. */
            }
          for (const module of eligible) {
            const previous = next.modules[module.id];
            if (previous)
              next.modules[module.id] = {
                ...previous,
                enabled: true,
                mode: "protect",
                threshold: 1,
                action: "strip",
              };
          }
          next.mode = "protect";
          next.zeroTolerance = true;
          if (!(current.mode === "protect" && current.zeroTolerance))
            next.protectionActivatedAt = Date.now();
          authorization.assertOwner(actorId);
          if (
            (generations.get(guildId) ?? 0) !== generation ||
            JSON.stringify(store.getConfig(guildId)) !== captured
          )
            throw new UserError("control.stale");
          store.setConfig(guildId, next);
        });
      queues.set(guildId, task);
      void task
        .finally(() => {
          if (queues.get(guildId) === task) queues.delete(guildId);
        })
        .catch(() => undefined);
      return task.then(() => health(guildId));
    },
  };
}
