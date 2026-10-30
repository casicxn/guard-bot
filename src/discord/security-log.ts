import { randomBytes } from "node:crypto";
import type {
  Client,
  EmbedBuilder,
  Message,
  MessageCreateOptions,
} from "discord.js";
import type { Logger } from "pino";
import type { Incident, Store } from "../contracts.js";
import { t, languageFor, moduleName, type Language } from "../locales/index.js";
import {
  ACTIVITY_COLORS,
  classifyActivity,
  activityReason,
  hasActualIntervention,
} from "../security/activity.js";
import { createEmbed } from "./embeds.js";
import { operationText } from "./presentation.js";

const snowflake = (value: string) => /^[1-9]\d{16,19}$/.test(value);
function targetText(incident: Incident, language: Language): string {
  const id = incident.event.targetId;
  if (!id) return t(language, "common.unknown");
  if (!snowflake(id)) return id.slice(0, 100);
  if (incident.event.action.startsWith("channel.")) return `<#${id}>`;
  if (incident.event.action.startsWith("role.")) return `<@&${id}>`;
  if (incident.event.action.startsWith("member.")) return `<@${id}>`;
  return id;
}
export function buildSecurityLog(
  language: Language,
  incident: Incident,
): EmbedBuilder {
  const kind = classifyActivity(incident),
    reason = activityReason(incident);
  const actionKey = `activity.action.${incident.event.action === "role.permissions" && incident.event.auditAction === 30 ? "role.create" : incident.event.action}`,
    action = t(language, actionKey);
  const enforcement =
    kind === "safe"
      ? "none"
      : hasActualIntervention(incident)
        ? "applied"
        : incident.status === "pending"
          ? "pending"
          : kind === "failed"
            ? "failed"
            : kind === "unresolved"
              ? "uncertain"
              : "none";
  const embed = createEmbed(language, {
    title: t(language, `activity.title.${kind}`),
    description: operationText(language, incident.result),
  })
    .setColor(ACTIVITY_COLORS[kind])
    .addFields(
      {
        name: t(language, "activity.field.action"),
        value: (action === actionKey
          ? moduleName(language, incident.event.action)
          : action
        ).slice(0, 1024),
      },
      {
        name: t(language, "activity.field.executor"),
        value:
          incident.confidence === "confirmed" &&
          incident.event.source === "audit" &&
          incident.event.executorId
            ? snowflake(incident.event.executorId)
              ? `<@${incident.event.executorId}>`
              : incident.event.executorId.slice(0, 100)
            : t(language, "common.unknown"),
      },
      {
        name: t(language, "activity.field.target"),
        value: targetText(incident, language),
      },
      {
        name: t(language, "activity.field.status"),
        value: t(language, `activity.class.${kind}`),
        inline: true,
      },
      {
        name: t(language, "activity.field.reason"),
        value: t(language, `activity.reason.${reason}`),
        inline: true,
      },
      {
        name: t(language, "activity.field.enforcement"),
        value: t(language, `activity.enforcement.${enforcement}`),
        inline: true,
      },
    )
    .setTimestamp(incident.createdAt);
  if (
    kind === "mitigated" &&
    (incident.containment?.status === "partial" ||
      incident.containment?.status === "failed" ||
      (incident.rollback && incident.rollback.status !== "succeeded"))
  )
    embed.addFields({
      name: t(language, "activity.field.result"),
      value: t(language, "activity.detail.partial"),
    });
  return embed;
}

interface LogReference {
  version: 1;
  state: "pending" | "sent";
  channelId: string;
  messageId?: string;
  fingerprint?: string;
  nonce?: string;
  createdAt: number;
}
const errorCode = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? Number(error.code)
    : undefined;
/** Pending/final decisions update one message. An uncertain send is never replayed blindly. */
export function createSecurityLogDelivery(
  client: Client,
  store: Store,
  logger: Logger,
): (incident: Incident) => Promise<void> {
  const queues = new Map<string, Promise<void>>(),
    localStates = new Map<string, string>();
  async function deliver(incident: Incident): Promise<void> {
    const kind = classifyActivity(incident);
    const localKey = `${incident.guildId}:${incident.id}`,
      localState = JSON.stringify(incident);
    if (localStates.get(localKey) !== localState) {
      if (localStates.size >= 1000)
        localStates.delete(localStates.keys().next().value!);
      localStates.set(localKey, localState);
      const write =
        kind === "failed"
          ? logger.error.bind(logger)
          : kind === "unresolved" ||
              incident.containment?.status === "partial" ||
              incident.containment?.status === "failed" ||
              incident.rollback?.status === "failed"
            ? logger.warn.bind(logger)
            : logger.info.bind(logger);
      write(
        {
          incidentId: incident.id,
          guildId: incident.guildId,
          action: incident.event.action,
          classification: kind,
          severity: incident.event.severity,
          confidence: incident.confidence,
          policy: incident.policy,
          status: incident.status,
          containment: incident.containment,
          rollback: incident.rollback,
          incident,
          executorName:
            incident.confidence === "confirmed" && incident.event.executorId
              ? client.guilds?.cache
                  ?.get(incident.guildId)
                  ?.members?.cache?.get(incident.event.executorId)?.displayName
              : undefined,
          targetName: incident.event.targetId
            ? (client.guilds?.cache
                ?.get(incident.guildId)
                ?.channels?.cache?.get(incident.event.targetId)?.name ??
              client.guilds?.cache
                ?.get(incident.guildId)
                ?.roles?.cache?.get(incident.event.targetId)?.name)
            : undefined,
        },
        "Guard activity",
      );
    }
    const config = store.getConfig(incident.guildId);
    if (config.notificationsEnabled === false || !config.logChannelId) return;
    const key = incident.id,
      previous = store.get<LogReference>(
        incident.guildId,
        "security_logs",
        key,
      ),
      language = languageFor(store, incident.guildId);
    const payload: MessageCreateOptions = {
      allowedMentions: { parse: [] },
      embeds: [buildSecurityLog(language, incident)],
    };
    const fingerprint = JSON.stringify(payload);
    if (previous?.state === "sent" && previous.fingerprint === fingerprint)
      return;
    if (previous?.state === "pending") {
      logger.warn(
        { incidentId: incident.id, guildId: incident.guildId },
        "Prior security log send is uncertain; duplicate suppressed",
      );
      return;
    }
    const channelId = previous?.channelId ?? config.logChannelId;
    try {
      const guild = await client.guilds.fetch(incident.guildId),
        channel = await guild.channels.fetch(channelId);
      if (!channel?.isTextBased() || !("send" in channel))
        throw new Error("Security log channel is unavailable");
      if (previous?.messageId) {
        if (!("messages" in channel))
          throw new Error("Security log history cannot be fetched");
        const message = await channel.messages.fetch({
          message: previous.messageId,
          force: true,
        });
        if (
          !client.user ||
          message.author.id !== client.user.id ||
          message.channelId !== channelId ||
          message.guildId !== incident.guildId
        )
          throw new Error("Security log message identity mismatch");
        await message.edit({
          allowedMentions: { parse: [] },
          embeds: payload.embeds,
        });
        store.put<LogReference>(incident.guildId, "security_logs", key, {
          ...previous,
          state: "sent",
          fingerprint,
        });
        return;
      }
      const nonce = randomBytes(12).toString("hex");
      store.put<LogReference>(incident.guildId, "security_logs", key, {
        version: 1,
        state: "pending",
        channelId,
        nonce,
        createdAt: Date.now(),
      });
      let message: Message;
      try {
        message = await channel.send({ ...payload, nonce, enforceNonce: true });
      } catch (error) {
        if ([50001, 50013, 50035].includes(errorCode(error) ?? 0))
          store.delete(incident.guildId, "security_logs", key);
        throw error;
      }
      if (
        !message?.id ||
        message.author?.id !== client.user?.id ||
        message.channelId !== channelId ||
        message.guildId !== incident.guildId
      )
        throw new Error("Security log delivery identity could not be verified");
      store.put<LogReference>(incident.guildId, "security_logs", key, {
        version: 1,
        state: "sent",
        channelId,
        messageId: message.id,
        fingerprint,
        createdAt: Date.now(),
      });
    } catch (error) {
      logger.warn(
        { err: error, guildId: incident.guildId, incidentId: incident.id },
        "Security log delivery failed; durable activity remains available",
      );
    }
  }
  return (incident) => {
    const snapshot = structuredClone(incident),
      key = `${incident.guildId}:${incident.id}`;
    const next = (queues.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => deliver(snapshot));
    queues.set(key, next);
    void next
      .finally(() => {
        if (queues.get(key) === next) queues.delete(key);
      })
      .catch(() => undefined);
    return next;
  };
}
