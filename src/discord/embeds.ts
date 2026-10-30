import { EmbedBuilder } from "discord.js";
import { t, type Language } from "../locales/index.js";
export type EmbedTone = "success" | "warning" | "error" | "info";
export const EMBED_COLORS: Record<EmbedTone, number> = {
  success: 0x2ecc71,
  warning: 0xf1c40f,
  error: 0xe74c3c,
  info: 0x3498db,
};
export function createEmbed(
  language: Language,
  options: {
    title: string;
    description?: string;
    tone?: EmbedTone;
    footer?: string;
  },
): EmbedBuilder {
  const signature = t(language, "common.brand");
  const footer = options.footer
    ? `${options.footer.slice(0, 2048 - signature.length - 3)} · ${signature}`
    : signature;
  const title = options.title.slice(0, 256);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS[options.tone ?? "info"])
    .setTitle(title)
    .setFooter({ text: footer });
  if (options.description)
    embed.setDescription(
      options.description.slice(
        0,
        Math.min(4096, 6000 - title.length - footer.length),
      ),
    );
  return embed;
}
