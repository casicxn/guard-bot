import { t } from "../locales/index.js";
import { SlashCommandBuilder, ChannelType } from "discord.js";
interface Localizable {
  setName(value: string): unknown;
  setDescription(value: string): unknown;
  setNameLocalizations(values: { tr: string; "en-US": string }): unknown;
  setDescriptionLocalizations(values: { tr: string; "en-US": string }): unknown;
}
function localized<T extends Localizable>(builder: T, key: string): T {
  const name = t("en", key + ".name");
  builder.setName(name);
  builder.setNameLocalizations({ tr: t("tr", key + ".name"), "en-US": name });
  const description = t("en", key + ".description");
  builder.setDescription(description);
  builder.setDescriptionLocalizations({
    tr: t("tr", key + ".description"),
    "en-US": description,
  });
  return builder;
}
function choice(key: string, value: string) {
  const name = t("en", key + ".name");
  return {
    name,
    name_localizations: { tr: t("tr", key + ".name"), "en-US": name },
    value,
  };
}
export const commandData = localized(new SlashCommandBuilder(), "command.guard")
  .setDefaultMemberPermissions(null)
  .setDMPermission(false)
  .addSubcommand((s) =>
    localized(s, "command.setup").addChannelOption((o) =>
      localized(o, "command.log-channel").addChannelTypes(
        ChannelType.GuildText,
      ),
    ),
  )
  .addSubcommand((s) => localized(s, "command.panel"))
  .addSubcommand((s) => localized(s, "command.status"))
  .addSubcommand((s) => localized(s, "command.health"))
  .addSubcommand((s) => localized(s, "command.help"))
  .addSubcommand((s) =>
    localized(s, "command.incidents").addIntegerOption((o) =>
      localized(o, "command.page").setMinValue(1).setMaxValue(10000),
    ),
  )
  .addSubcommand((s) =>
    localized(s, "command.mode").addStringOption((o) =>
      localized(o, "command.value")
        .setRequired(true)
        .addChoices(
          choice("command.choice.monitor", "monitor"),
          choice("command.choice.protect", "protect"),
        ),
    ),
  )
  .addSubcommand((s) => localized(s, "command.modules"))
  .addSubcommand((s) => localized(s, "command.limits"))
  .addSubcommand((s) =>
    localized(s, "command.lockdown").addBooleanOption((o) =>
      localized(o, "command.enabled").setRequired(true),
    ),
  )
  .addSubcommandGroup((g) =>
    localized(g, "command.whitelist")
      .addSubcommand((s) =>
        localized(s, "command.add").addStringOption((o) =>
          localized(o, "command.subject").setRequired(true),
        ),
      )
      .addSubcommand((s) =>
        localized(s, "command.remove").addStringOption((o) =>
          localized(
            o,
            "command.subject.id-whose-trusted-list-entries-should-be-removed",
          ).setRequired(true),
        ),
      )
      .addSubcommand((s) => localized(s, "command.list")),
  )
  .addSubcommandGroup((g) =>
    localized(g, "command.backup")
      .addSubcommand((s) => localized(s, "command.create"))
      .addSubcommand((s) => localized(s, "command.list.see-saved-backups"))
      .addSubcommand((s) =>
        localized(s, "command.jobs")
          .addStringOption((o) => localized(o, "command.id"))
          .addIntegerOption((o) =>
            localized(o, "command.page.result-page-starting-at-1")
              .setMinValue(1)
              .setMaxValue(10000),
          ),
      )
      .addSubcommand((s) =>
        localized(s, "command.restore")
          .addStringOption((o) =>
            localized(
              o,
              "command.id.backup-reference-shown-in-the-backup-list",
            ).setRequired(true),
          )
          .addStringOption((o) =>
            localized(o, "command.scope").addChoices(
              choice("command.choice.all", "all"),
              choice("command.choice.roles", "roles"),
              choice("command.choice.channels", "channels"),
              choice("command.choice.guild", "guild"),
            ),
          ),
      ),
  );
