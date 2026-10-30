import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type Interaction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type ButtonInteraction,
} from "discord.js";
import type { Logger } from "pino";
import type { Store } from "../contracts.js";
import type { ManagementControls } from "../control/contracts.js";
import { languageFor, t } from "../locales/index.js";
import { createEmbed, EMBED_COLORS } from "./embeds.js";
import { UserError, userErrorText } from "./errors.js";
import { Sessions, type Session } from "./sessions.js";
import {
  isPrivatePanelView,
  contextualPanelOperations,
  panelViewSignature,
  type PermanentPanel,
  type PermanentPanelRecord,
} from "./permanent-panel.js";

export function createPermanentRouter(
  store: Store,
  logger: Logger,
  sessions: Sessions,
  controls: ManagementControls,
  permanent: PermanentPanel,
  legacy: (interaction: Interaction) => Promise<void>,
) {
  const ephemeral = (
    payload: InteractionEditReplyOptions,
  ): InteractionReplyOptions => ({
    content: payload.content ?? undefined,
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: { parse: [] },
    flags: MessageFlags.Ephemeral,
  });
  const linkReply = (guildId: string, record: PermanentPanelRecord) => ({
    embeds: [
      createEmbed(languageFor(store, guildId), {
        title: t(languageFor(store, guildId), "persistent.ready"),
        description: t(languageFor(store, guildId), "persistent.link", {
          url: permanent.url(guildId, record),
        }),
        tone: "success",
      }),
    ],
    components: [],
    allowedMentions: { parse: [] as never[] },
  });
  function bind(
    payload: InteractionEditReplyOptions,
    actorId: string,
    guildId: string,
    record: PermanentPanelRecord,
  ) {
    permanent.annotatePrivate(payload, actorId, guildId, record);
    return payload;
  }
  function confidential(
    payload: InteractionEditReplyOptions,
    actorId: string,
    guildId: string,
    record: PermanentPanelRecord,
  ): InteractionEditReplyOptions {
    bind(payload, actorId, guildId, record);
    const json = JSON.parse(JSON.stringify(payload)) as {
      components?: {
        components: {
          custom_id?: string;
          type?: number;
          [key: string]: unknown;
        }[];
      }[];
    };
    const rows = (json.components ?? [])
      .map((row) => ({
        ...row,
        components: row.components.filter(
          (component) => !/^guard:section:/.test(component.custom_id ?? ""),
        ),
      }))
      .filter((row) => row.components.length);
    return {
      ...payload,
      components: rows as unknown as InteractionEditReplyOptions["components"],
      allowedMentions: { parse: [] },
    };
  }
  return async (interaction: Interaction): Promise<void> => {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isMessageComponent() &&
      !interaction.isModalSubmit()
    )
      return;
    const install =
      interaction.isChatInputCommand() &&
      interaction.commandName === "guard" &&
      !interaction.options.getSubcommandGroup() &&
      interaction.options.getSubcommand() === "panel";
    const customId = interaction.isChatInputCommand()
      ? ""
      : interaction.customId;
    const publicRoute = customId.startsWith("ug:");
    const commandBridge =
      interaction.isChatInputCommand() &&
      interaction.commandName === "guard" &&
      !install;
    const token = /^guard:[a-z-]+:([a-f0-9]{24})$/.exec(customId)?.[1];
    let privateSession: Session | undefined;
    if (
      token &&
      interaction.guildId &&
      controls.authorization.isBotOwner(interaction.user.id)
    )
      try {
        privateSession = sessions.get(
          token,
          interaction.user.id,
          interaction.guildId,
        );
      } catch {
        /* The legacy router renders localized expiration errors. */
      }
    if (
      !install &&
      !publicRoute &&
      !commandBridge &&
      !privateSession?.panelMessageId
    ) {
      await legacy(interaction);
      return;
    }
    if (!(await controls.authorization.requireBotOwner(interaction))) return;
    const guildId = interaction.guildId,
      actorId = interaction.user.id;
    try {
      if (!guildId) throw new UserError("error.guildOnly");
      if (install) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const record = await permanent.ensure(
          actorId,
          guildId,
          interaction.channelId!,
        );
        await interaction.editReply(linkReply(guildId, record));
        return;
      }
      let savedRecord = permanent.get(guildId);
      if (!savedRecord?.panelEnabled && commandBridge) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        savedRecord = await permanent.ensure(
          actorId,
          guildId,
          interaction.channelId!,
        );
      }
      const record = savedRecord;
      if (!record?.panelEnabled)
        throw new UserError("persistent.notRegistered");
      const publicMatch = /^ug:v1:panel:([a-z-]+)(?::([a-f0-9]{12}))?$/.exec(
        customId,
      );
      const operation = commandBridge
        ? "command"
        : publicRoute
          ? publicMatch?.[1]
          : /^guard:([a-z-]+):/.exec(customId)?.[1];
      if (!operation) throw new UserError("persistent.obsolete");
      if (
        publicRoute &&
        contextualPanelOperations.has(operation) &&
        publicMatch?.[2] !== panelViewSignature(record.view)
      )
        throw new UserError("control.stale");
      if (publicRoute) {
        if (
          !interaction.isMessageComponent() ||
          interaction.channelId !== record.panelChannelId ||
          interaction.message.id !== record.panelMessageId ||
          interaction.message.author.id !== interaction.client.user?.id
        )
          throw new UserError("persistent.notRegistered");
      } else if (
        !commandBridge &&
        (privateSession?.panelMessageId !== record.panelMessageId ||
          privateSession.panelChannelId !== record.panelChannelId)
      )
        throw new UserError("control.stale");
      if (!publicRoute && privateSession?.pending?.kind === "panelMove") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        sessions.consume(token!);
        if (operation === "cancel") {
          await interaction.editReply(linkReply(guildId, record));
          return;
        }
        if (operation !== "confirm") throw new UserError("error.invalidRoute");
        const next = await permanent.move(
          actorId,
          guildId,
          privateSession.pending.channelId,
          privateSession.pending.expectedMessageId,
        );
        await interaction.editReply(linkReply(guildId, next));
        return;
      }
      if (
        publicRoute &&
        interaction.isMessageComponent() &&
        ["panel-tools", "panel-pin", "panel-move", "private-open"].includes(
          operation,
        )
      ) {
        await interaction.deferUpdate();
        if (operation === "panel-tools") {
          await permanent.openTools(actorId, guildId);
          return;
        }
        if (operation === "panel-pin") {
          await permanent.pin(actorId, guildId);
          await interaction.followUp({
            embeds: [
              createEmbed(languageFor(store, guildId), {
                title: t(languageFor(store, guildId), "persistent.pin"),
                description: t(
                  languageFor(store, guildId),
                  "persistent.pinned",
                ),
                tone: "success",
              }),
            ],
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          });
          return;
        }
        if (operation === "private-open") {
          await interaction.followUp(
            ephemeral(
              confidential(
                await permanent.privateView(actorId, guildId),
                actorId,
                guildId,
                record,
              ),
            ),
          );
          return;
        }
        if (!interaction.isChannelSelectMenu() || !interaction.values[0])
          throw new UserError("panel.invalidChoice");
        const pending = sessions.create(actorId, guildId, {
            panelMessageId: record.panelMessageId,
            panelChannelId: record.panelChannelId,
            pending: {
              kind: "panelMove",
              channelId: interaction.values[0],
              expectedMessageId: record.panelMessageId,
            },
          }),
          language = languageFor(store, guildId);
        await interaction.followUp({
          embeds: [
            createEmbed(language, {
              title: t(language, "persistent.moveTitle"),
              description: t(language, "persistent.moveConfirm", {
                channel: `<#${interaction.values[0]}>`,
              }),
              tone: "warning",
            }),
          ],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`guard:confirm:${pending}`)
                .setLabel(t(language, "common.confirm"))
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`guard:cancel:${pending}`)
                .setLabel(t(language, "common.cancel"))
                .setStyle(ButtonStyle.Secondary),
            ),
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      const revision = permanent.issueRevision(guildId);
      const publicToken = publicRoute
        ? sessions.create(actorId, guildId, {
            ...record.view,
            panelMessageId: record.panelMessageId,
            panelChannelId: record.panelChannelId,
          })
        : undefined;
      const routedId = publicToken
        ? `guard:${operation}:${publicToken}`
        : customId;
      let modalOpened = false;
      const proxied = new Proxy(interaction, {
        get(target, key) {
          if (key === "customId") return routedId;
          if (key === "deferReply" && commandBridge)
            return (options: Parameters<ButtonInteraction["deferReply"]>[0]) =>
              target.deferred || target.replied
                ? Promise.resolve()
                : target.deferReply(options);
          if (key === "showModal" && !target.isModalSubmit())
            return async (
              payload: Parameters<ButtonInteraction["showModal"]>[0],
            ) => {
              modalOpened = true;
              return target.showModal(payload);
            };
          if (key === "deferUpdate" && !publicRoute)
            return () =>
              target.isMessageComponent()
                ? target.deferUpdate()
                : target.deferReply({ flags: MessageFlags.Ephemeral });
          if (key === "editReply")
            return async (payload: InteractionEditReplyOptions) => {
              if (
                (
                  JSON.parse(JSON.stringify(payload)) as {
                    embeds?: { color?: number }[];
                  }
                ).embeds?.[0]?.color === EMBED_COLORS.error
              )
                return publicRoute
                  ? target.followUp(ephemeral({ ...payload, components: [] }))
                  : target.editReply({ ...payload, components: [] });
              const state = permanent.sessionIn(payload, actorId, guildId);
              if (state?.pending) {
                bind(payload, actorId, guildId, record);
                if (publicRoute) return target.followUp(ephemeral(payload));
                return target.editReply(payload);
              }
              if (
                publicRoute &&
                state?.section === "restart" &&
                isPrivatePanelView(state)
              ) {
                return target.followUp(
                  ephemeral(confidential(payload, actorId, guildId, record)),
                );
              }
              if (publicRoute) {
                await permanent.publish(actorId, guildId, payload, revision);
                return;
              }
              if (isPrivatePanelView(state) && operation !== "main")
                return target.editReply(
                  confidential(payload, actorId, guildId, record),
                );
              if (state?.section)
                await permanent.publish(actorId, guildId, payload, revision);
              else await permanent.home(actorId, guildId, revision);
              return target.editReply(
                linkReply(guildId, permanent.get(guildId)!),
              );
            };
          const value = Reflect.get(target, key, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as Interaction;
      try {
        await legacy(proxied);
      } finally {
        if (publicToken && !modalOpened)
          try {
            sessions.consume(publicToken);
          } catch {
            /* Mutations already consumed it. */
          }
      }
    } catch (error) {
      logger.warn(
        { err: error, guildId },
        "Permanent panel interaction failed",
      );
      const language = guildId ? languageFor(store, guildId) : "tr";
      const payload = {
        embeds: [
          createEmbed(language, {
            title: t(language, "panel.error"),
            description: userErrorText(language, error),
            tone: "error",
          }),
        ],
        allowedMentions: { parse: [] as never[] },
      };
      if (interaction.deferred || interaction.replied)
        await interaction
          .followUp({ ...payload, flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      else
        await interaction
          .reply({ ...payload, flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
    }
  };
}
