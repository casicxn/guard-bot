import { REST, Routes } from "discord.js";
import { readEnvironment } from "./configuration/index.js";
import { commandData } from "./discord/index.js";
const env = readEnvironment();
const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
const route = env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(env.DISCORD_CLIENT_ID);
await rest.put(route, { body: [commandData.toJSON()] });
console.info(
  `Registered /guard commands (${env.DISCORD_GUILD_ID ? "development guild" : "global"}).`,
);
