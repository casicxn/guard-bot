import { MessageFlags, type Interaction } from "discord.js";
import type { Logger } from "pino";
import type { Store } from "../contracts.js";
import { createEmbed } from "../discord/embeds.js";
import { UserError } from "../discord/errors.js";
import { languageFor, t } from "../locales/index.js";
import type { OwnerAuthorization } from "./contracts.js";
import { ownerIdSchema } from "./identity.js";
export { ownerIdSchema } from "./identity.js";

/** Management identity is immutable process configuration and never comes from guild data. */
export class AuthorizationService implements OwnerAuthorization {
  readonly #ownerId: string;
  private readonly denied = new Map<string, number>();
  constructor(
    ownerId: string,
    private readonly store: Store,
    private readonly logger: Logger,
  ) {
    this.#ownerId = ownerIdSchema.parse(ownerId);
  }
  isBotOwner(userId: string): boolean {
    return typeof userId === "string" && userId === this.#ownerId;
  }
  assertOwner(userId: string): void {
    if (!this.isBotOwner(userId)) throw new UserError("error.owner");
  }
  async requireBotOwner(interaction: Interaction): Promise<boolean> {
    if (this.isBotOwner(interaction.user.id)) return true;
    this.recordDenied(interaction);
    const language = interaction.guildId
      ? languageFor(this.store, interaction.guildId)
      : "tr";
    const response = {
      embeds: [
        createEmbed(language, {
          title: t(language, "ownership.deniedTitle"),
          description: t(
            language,
            "customId" in interaction && interaction.customId.startsWith("ug:")
              ? "persistent.denied"
              : "ownership.denied",
          ),
          tone: "error",
        }),
      ],
      flags: MessageFlags.Ephemeral as const,
      allowedMentions: { parse: [] as never[] },
    };
    // A rejected component must never edit the original panel, including one already acknowledged.
    try {
      if ("reply" in interaction && typeof interaction.reply === "function") {
        if (interaction.deferred || interaction.replied)
          await interaction.followUp(response);
        else await interaction.reply(response);
      }
    } catch (error) {
      // Expired Discord interactions still remain denied; no configuration operation follows.
      this.logger.debug?.(
        {
          err: error,
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
        "Unauthorized interaction response unavailable",
      );
    }
    return false;
  }
  private recordDenied(interaction: Interaction): void {
    const now = Date.now(),
      key = `${interaction.guildId ?? "direct"}:${interaction.user.id}`;
    for (const [id, time] of this.denied)
      if (now - time >= 60000) this.denied.delete(id);
    if (this.denied.has(key)) return;
    if (this.denied.size >= 1000)
      this.denied.delete(this.denied.keys().next().value!);
    this.denied.set(key, now);
    this.logger.warn(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        interactionType: interaction.type,
      },
      "Unauthorized management interaction denied",
    );
  }
}
