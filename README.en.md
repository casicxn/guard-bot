# Ultimate Guard

[Türkçe](README.md) | [English](README.en.md)

A Discord server protection bot built with discord.js v14, TypeScript and SQLite.

## Features

- Tracks channel, role, permission and server setting changes through audit logs.
- Can remove dangerous roles, kick members or ban them according to the configured rules.
- Supports allowlists for users, bots and roles.
- Backs up supported role, channel and server settings and restores them after confirmation.
- Can temporarily restrict dangerous role permissions during planned restarts and restore the recorded permissions afterward.
- Managed inside Discord through `/guard panel`.
- Includes Turkish and English interfaces, activity logs and voice channel connections.

Management access belongs to the account set in `BOT_OWNER_ID` in `.env`. Server administrator permissions or allowlist membership do not grant management access.

## Installation

Requires Node.js 24 LTS and pnpm 11.25.0.

```sh
git clone https://github.com/casicxn/guard-bot.git
cd guard-bot
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` and fill in these fields:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
BOT_OWNER_ID=
```

You can add `DISCORD_GUILD_ID` to register commands for a test server. Do not share your `.env` file or bot token.

In the Discord Developer Portal, invite the bot to your server with the `bot` and `applications.commands` scopes. Grant View Audit Log and the permissions required for the actions you intend to use. Place the bot's role above the roles it needs to manage.

```sh
pnpm register
pnpm build
pnpm start
```

Command registration is a separate step; starting the bot does not register commands again. To register commands globally, remove `DISCORD_GUILD_ID` and run `pnpm register`.

## Usage

Using the bot owner account, run:

```text
/guard setup log-channel:#security-log
/guard health
/guard panel
```

The bot starts in monitoring mode on a fresh installation. Use the panel's protection activation button to enable enforcement. Language, allowlists, backups and other settings are also managed from the panel.

Edit `src/configuration/bot-profile.ts` to change the bot's status and profile text, then rebuild and restart. Voice channel connections are configured in the panel; audio playback and recording are not supported.

## Backups and limitations

Create a baseline backup of a clean server with `/guard backup create`. Restoration requires a preview and confirmation from the bot owner. Deleted objects receive new IDs when recreated. Messages, membership history and some Discord resource types cannot be restored.

Protection depends on the bot's permissions, role hierarchy and Discord audit logs. No automatic punishment is applied when the actor cannot be verified. Live Discord and Docker validation is not yet complete; try the bot on a separate test server before using it.

## Docker

After preparing `.env` and registering commands:

```sh
docker compose up --build -d
docker compose logs --tail=100 -f guard
```

Data is stored in the `guard-data` volume. `docker compose down -v` deletes that data. Run only one bot process for the same token and database.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke
```

Tests use mocked Discord responses and temporary databases. `pnpm smoke` checks the compiled application without connecting to Discord.

## License

[MIT](LICENSE)
