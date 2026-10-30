# Ultimate Guard

[![Quality](https://github.com/casicxn/guard-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/casicxn/guard-bot/actions/workflows/ci.yml)

[Turkish usage guide](docs/USAGE_TR.md) · [Command reference](docs/COMMANDS.md) · [Operations](docs/OPERATIONS.md) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md)

A self-hosted Discord security bot built with TypeScript, discord.js v14 and SQLite. Configuration, incident review and recovery happen inside Discord through `/guard` commands and a permanent channel control panel. One Node.js process runs the application; no web dashboard, domain, inbound port, database server or paid service is required.

**Status:** implemented application under validation. Automated checks and their latest results are recorded in `PROJECT_STATUS.md`. Live Discord registration, interaction and enforcement verification in a controlled test guild remain pending. Docker files are supplied; a local Docker build has not been verified in this development environment. This is not yet a verified production release.


## Implemented capabilities

- Owner-confirmed planned Restart Protection: durable role permission snapshots, verified dangerous-flag lockdown, conflict-aware restoration after Guard readiness and an emergency CLI. [Usage, coverage and manual recovery](docs/RESTART_PROTECTION.md).

- Bilingual readable colored console in development and production, optional bounded rotating JSON diagnostics, coordinated restart recovery and one separate localized startup notification per saved panel guild. [Logging and restart operations](docs/LOGGING_AND_RESTART.md).

- Complete centralized TR/EN runtime and native-command localization, with key/placeholder completeness checks. Select language in permanent panel → General Settings → Language; profile text itself is global developer-configured content.

- One registered public control message per guild, restored after restart, with owner-only stable controls and private sensitive workflows. [Permanent panel setup](docs/PERMANENT_PANEL.md).

- Owner-confirmed one-click zero-tolerance Protect: first confirmed administrative violation triggers manageable dangerous-role containment followed by a separate safe rollback job. [Coverage and limitations](docs/ANTI_NUKE.md).
- Single instance owner from required `BOT_OWNER_ID`, enforced for commands, components, modals and management service boundaries across every guild.
- Complete Discord-native navigation, scoped-entry upgrade/removal confirmations, backup actions, settings, health and incident filters.
- Source-configured global presence and application description, with a read-only profile view; per-guild persistent voice settings retain native channel selection, manual controls and bounded reconnects.
- A centralized security pipeline with guild-specific settings, action-scoped user/role/bot trust, expiring whitelist entries, sliding-window thresholds, durable deduplication and incident storage.
- Authoritative audit gateway processing for channel, permission overwrite, role, member moderation, guild, webhook, integration, AutoMod, invite, emoji, sticker, thread, scheduled event and soundboard actions.
- Shared bounded REST fallback for missing channel/role create/delete audit events; ambiguous matches remain unresolved.
- Separate classification of dangerous role creation and member role permission grants (`role.permissions`, `member.permissions`). Trust for ordinary role updates does not automatically cover `role.permissions`.
- Log, warning, dangerous-role removal, kick, ban and emergency verification policies, subject to explicit configuration and Discord permission/hierarchy checks. Unsupported actions fail with a recorded reason.
- Limited automatic reversal of audited role name/permissions and guild name/security/notification changes, only when the live state still matches the audited new values. Other changes use manual structural recovery where supported.
- Guided bilingual panels, friendly protection names, numerical limit forms, contextual help and one-use restore confirmations. Turkish is the default, with a saved English option per server.
- Simple all-module whitelist commands automatically recognize users, bots and roles; existing advanced entries remain compatible.
- Consistent localized embeds with a subtle Casi developer signature.
- Manual and scheduled structural snapshots with retention, preview, selective restore, persistent ID mapping and operation journals.
- Optional join, account-age, message-rate and mention-rate monitoring. These modules produce observations only; they do not automatically punish joiners or message authors.
- Classified localized activity logs: verified Safe green, Monitored yellow, actual Mitigated red, Unresolved orange and Failed dark red. Trusted actions remain visible without inflating hostile incident counts; pending/final results update one audit-log message.
- Structured local logs, health information, SQLite migrations and multi-guild data separation.

The current implementation does not promise complete protection against every attack. Audit entries can arrive late or be unavailable; missing attribution never justifies punishment. Disconnections can leave gaps. Recovery cannot recreate deleted Discord IDs, messages or membership history.

## Requirements

- Node.js **24 LTS** and pnpm **11.25.0**.
- A Discord application with a bot token, application ID and access to a controlled test guild.
- A writable local data directory. Use one running bot process per database and token.

SQLite uses Node's built-in `node:sqlite` driver with versioned SQL migrations. This lightweight alternative avoids an additional native addon or database service. Settings, incidents, snapshots, mappings and job journals are stored locally.

## Installation

Clone the repository (or download and extract the source from **Code → Download ZIP**), then run from its root:

```sh
git clone https://github.com/casicxn/guard-bot.git
cd guard-bot
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` for the last step. Edit `.env` locally and set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and `BOT_OWNER_ID` (your Discord user ID). Never commit or paste a real token into issues, chat messages or test fixtures.

In the Discord Developer Portal, configure the bot and install it with the `bot` and `applications.commands` scopes. Grant the permissions needed for the policies you will use. Place its role above the roles it is expected to manage; Administrator does not remove Discord hierarchy restrictions.

For initial development, set `DISCORD_GUILD_ID` to your test guild ID. Then:

```sh
pnpm register
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

For source development use `pnpm dev`. Registration is a separate explicit command; starting the bot does not overwrite slash commands. Remove the `DISCORD_GUILD_ID` variable entirely and run `pnpm register` when you are ready for global registration. Guild registration is scoped to the selected guild; global registration affects all guilds where the application is installed and may take time to appear. Remove obsolete development guild commands separately if you later switch registration scope.

The configured BOT_OWNER_ID user should run:

```text
/guard setup log-channel:#security-log
/guard health
/guard panel
```

Fresh installations monitor only. Observe events in a controlled guild before enabling active policies.

Activate Anti-Nuke through `/guard panel` → Security Overview → **Enable Protection**, review health warnings and confirm. All eligible administrative modules activate together; previous disabled flags and thresholds cannot block this profile. **Switch to Monitor Mode** stops further automatic effects. Invites, thread participation and optional raids stay monitoring-only. Actions may be detected after Discord executes them; permissions, hierarchy and trustworthy history limit containment/recovery.

Bot status, activity and About Me now use [`src/configuration/bot-profile.ts`](src/configuration/bot-profile.ts) as their single source of truth. Edit it, rebuild and restart; the panel profile view is read-only. See [profile configuration and application description](docs/BOT_PROFILE.md). Voice remains editable in the panel and persists per guild, with auto-join off and mute/deaf on by default. Select a voice channel/ID and connect or enable auto-join; manual disconnect pauses reconnection across restart. No playback or recording is added.

## Permissions and intents

| Capability                              | Bot permissions / intents                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Core audit monitoring                   | View Audit Log; `Guilds` and `GuildModeration` gateway intents                                                                        |
| Discord incident embeds                 | View Channel, Send Messages and Embed Links in the selected log channel                                                               |
| Remove dangerous roles / restore roles  | Manage Roles, with the affected roles below the bot                                                                                   |
| Kick or ban                             | Kick Members or Ban Members, plus valid hierarchy                                                                                     |
| Channel restoration                     | Manage Channels and Manage Roles; permission overwrites are also checked                                                              |
| Guild settings / emergency verification | Manage Server                                                                                                                         |
| Join/account observations               | Optional `GuildMembers` privileged intent; enable it in the portal and set `ENABLE_MEMBERS_INTENT=true`                               |
| Message-rate / mention observations     | Optional `GuildMessages` intent through `ENABLE_MESSAGE_MONITORING=true`                                                              |
| Message content access                  | Optional `ENABLE_MESSAGE_CONTENT=true` and the corresponding portal intent; not needed for core protection or message-rate monitoring |

Core startup also requests nonprivileged webhook, invite, emoji/sticker and scheduled-event gateway intents. Only enable privileged intents you intend to use. `/guard health` reports availability; configuring a module does not grant missing permissions or intents.

## Guided configuration and language

Use `/guard panel` → **General Settings** → **Language / Dil** to select 🇹🇷 Türkçe or 🇬🇧 English. Turkish is the default. The choice is saved for that server and survives restarts. Existing security settings, trust records, incidents and backups are retained.

Bot responses follow the **server language**. Discord's own slash-command names and descriptions follow each person's **Discord client locale** through native `tr` and `en-US` metadata. Internal identifiers stay stable. Examples here use English names; a Turkish client shows localized equivalents such as `/guard beyaz-liste ekle hedef:<ID>` and `/guard limitler`.

`/guard limits` opens a private protection selector. Choose a friendly name such as **Mass Ban Protection**, read its explanation, and press **Edit action limit**. Enter the count and time window. For example, 5 actions in 60 seconds means the response can run on the fifth matching action, after identity and permission checks. Ranges: 1–10000 actions and 1–86400 seconds. Account-age monitoring explains its fixed age rule instead of offering this form.

`/guard modules` opens the same protection settings. Select whether a protection is enabled, its mode and a readable response choice. Automatic effects require both global Protect mode and the protection's Protect mode, plus an explicit non-log response. Use `/guard mode` to choose the global mode. New installations remain Monitor/record-only until explicitly changed. Optional raid features remain observations only.

## Simple whitelist

```text
/guard whitelist add subject:<user-or-role-id>
/guard whitelist remove subject:<user-or-role-id>
/guard whitelist list
```

Only the subject ID is required. The bot checks current server roles first, then resolves a current member and identifies bots automatically. Invalid, outside-server or unverified IDs are not trusted. Duplicate unrestricted entries do not create copies. Re-adding an older scoped or expiring entry requests separate upgrade confirmation; unrelated records remain intact.

**New whitelist additions grant unrestricted access to all guard protections.** Add only users, bots and roles you fully trust. Management is restricted to the single BOT_OWNER_ID user across every server. This identity is also exempt from automatic enforcement. Server ownership, Administrator and whitelist membership do not grant management access. The panel also offers user/role pickers. Removal works after a member leaves. Existing advanced action-specific and expiring entries keep working internally and display their scope until explicitly changed.

Use `/guard help` or the panel's **Help** section for modes, thresholds, permissions, trust, language and recovery. `lockdown` raises verification to Very High and retains its prior level; it does not freeze current members or lock every channel.

## Backups and recovery

Create a clean baseline with `/guard backup create`. Configure scheduling and retention through the panel's retention settings. Scheduling is disabled by default; the running process checks due backups periodically. It cannot create backups while offline.

`/guard backup restore id:<snapshot-id> scope:all` first displays a preview. The owner must confirm before changes begin. Scopes are `roles`, `channels`, `guild` and `all`.

Supported restoration covers ordinary role configuration and permissions; text, voice, category and announcement channel configuration; permission overwrites and parent relationships; and selected guild settings. Recovery updates existing supported resources and creates missing ones with new IDs. It does not delete extra resources. Persistent mappings reconnect restored parent/role references.

Managed roles, member role assignments, role positions, guild icons, messages, members, forum/stage channels, threads, integrations, webhooks, emoji, stickers and soundboard assets are not restored from these snapshots. Permission or hierarchy failures can produce partial results, which are recorded in recovery jobs. An uncertain interrupted create is not repeated automatically: inspect the journal and reconcile it before retrying. See [operations](docs/OPERATIONS.md).

## Docker

After creating `.env` and registering commands, run:

```sh
docker compose up --build -d
docker compose logs --tail=100 -f guard
```

Compose persists SQLite in the `guard-data` volume and rotates container logs. No ports are published. The image runs as a non-root user. Keep the volume when recreating the container. `docker compose down -v` deletes the stored settings and backups.

To register commands through a built image:

```sh
docker compose run --rm guard node dist/register.js
```

Compose supplies environment variables from `.env`; the container entry point does not require an `.env` file inside the image.

## Development and release validation

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

After building, `pnpm smoke` checks the compiled application wiring and shutdown offline without logging into Discord.

Tests use mocked Discord APIs and temporary SQLite databases. They do not perform destructive actions against a live server. The CI workflow runs these checks on Node 24 and builds the Docker image. A passing local suite does not prove that slash commands, gateway permissions or panel interactions work on a real guild.

Remaining release validation includes controlled live Discord setup/registration/panel testing, permission-loss and reconnect exercises, supported restoration on a disposable guild, and Docker deployment verification. Broader automatic recovery and punitive raid response are not implemented. See `PROJECT_STATUS.md` for the exact continuation point.

Contributions are welcome under the [MIT license](LICENSE). Read [CONTRIBUTING.md](CONTRIBUTING.md) and `AGENTS.md` before changing security decisions or recovery behavior.
