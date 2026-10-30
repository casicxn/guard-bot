# Operations and recovery

## Runtime and environment

Run one instance for a bot token and SQLite database. Discord's REST client handles API rate-limit scheduling; the application processes each guild's security events in order. A backlog or outage can reduce coverage. Keep the bot on reliable storage and monitor process restarts and structured error logs.

| Variable                    | Required / default        | Purpose                                                                                                                     |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`             | Required                  | Bot credential; keep private.                                                                                               |
| `DISCORD_CLIENT_ID`         | Required                  | Discord application ID used for command registration.                                                                       |
| `BOT_OWNER_ID`              | Required                  | The only Discord user allowed to manage this instance in every guild. Valid unsigned snowflake; change locally and restart. |
| `DISCORD_GUILD_ID`          | Optional; omit for global | Development command registration guild. Omit the line rather than assigning an empty value.                                 |
| `DATABASE_PATH`             | `./data/guard.sqlite`     | Local SQLite path. Container default is `/app/data/guard.sqlite`.                                                           |
| `LOG_LEVEL`                 | `info`                    | `debug`, `info`, `warn` or `error`.                                                                                         |
| `ENABLE_MEMBERS_INTENT`     | `false`                   | Request the privileged member gateway intent for join/account observations.                                                 |
| `ENABLE_MESSAGE_MONITORING` | `false`                   | Request message events for rate and mention observations.                                                                   |
| `ENABLE_MESSAGE_CONTENT`    | `false`                   | Optional privileged message content access; not required by core protection.                                                |

Boolean values are the literal strings `true` or `false`. Environment validation rejects invalid credentials/IDs and malformed values before connection. Set privileged portal intents to match requested intents. The bot does not require Presence intent.

## Presence and persistent voice

The panel's Bot Profile view is read-only. Global status, activity and application description come solely from src/configuration/bot-profile.ts; edit, rebuild and restart. Old SQLite presence rows remain preserved but cannot override source configuration. Description synchronization uses the official application API, validates 400 characters, compares fetched data, and makes at most one startup attempt. Set syncAboutMeOnStartup=false to manage Description in Discord Developer Portal → General Information. API/config errors are local warnings and never stop security. See [profile guide](BOT_PROFILE.md).

Presence supports online/idle/dnd/invisible and Playing/Watching/Listening/Competing/Custom/none. Custom uses ActivityType.Custom + state; no bot custom emoji, user bio or selfbot endpoint is used. Profile text is global developer content and is independent of per-guild UI language. Voice configuration remains per guild in the existing SQLite database.

Choose a regular voice channel through the native channel selector or the channel-ID form. Grant View Channel and Connect; `GuildVoiceStates` is enabled by the application. Defaults are auto-join off, self-mute on and self-deaf on. Enable auto-join or use Connect. Mute/deaf controls update the active connection. Manual Disconnect persists a pause across process restarts; Connect, Reconnect or explicitly enabling auto-join clears it. Selecting a channel alone does not guarantee an active connection; inspect the actual connected channel and state.

Temporary failures use at most five exponential retries (1, 2, 4, 8 and 16 seconds). Deleted channels and missing permissions stop retries and require operator correction. The manager keeps one connection per guild and disposes connections on shutdown. Auto-join restores on readiness/restart only when enabled and not manually paused. A running, connected process is required; outages and host downtime prevent voice presence. No audio playback, recording, Opus or FFmpeg is required by this feature. `@discordjs/voice` 0.19.2 includes the DAVE dependency required by the current voice protocol.

Local tests simulate Discord and voice failures. Real voice negotiation, status display, restart recovery, native controls and permissions still require a controlled live guild.

## Installation checklist

1. Install Node 24 LTS and pnpm 11.25.0.
2. Run `pnpm install --frozen-lockfile` in the repository root.
3. Copy `.env.example` to `.env` and enter bot credentials and BOT_OWNER_ID (your Discord user ID) locally. Missing or invalid BOT_OWNER_ID prevents startup and registration.
4. Install the application in a controlled test guild with the `bot` and `applications.commands` scopes.
5. Grant View Audit Log and log-channel permissions, plus only the enforcement/restoration permissions you intend to use.
6. Place the bot role above manageable roles and users.
7. Set `DISCORD_GUILD_ID` for initial guild command registration and run `pnpm register`.
8. Run `pnpm build` and `pnpm start`.
9. As the configured BOT_OWNER_ID user, run `/guard setup`, `/guard health` and `/guard panel`.
10. Verify monitor-mode incidents and whitelist behavior before deliberately enabling a policy.

The current repository's automated tests use mocks and temporary local databases. Live Discord registration, component interactions, hierarchy and controlled recovery still require integration verification. Do not perform destructive trials on an uncontrolled server.

## Incident interpretation

Incidents include an event ID, action, target, timestamp, confidence, policy, status and result. A `confirmed` audit event means its authoritative audit payload identified the executor and target and passed action/time validation. It does not mean every Discord API effect succeeded. Read the final status/result.

`unresolved` observations never cause punishment. A member departure without a matching authoritative kick entry is not evidence of a kick. Channel/role create/delete events wait briefly for the primary audit feed, then share at most two REST audit fetch attempts with exact action, target and time checks. Multiple candidates are unresolved. Fallback observations can remain unresolved when audit delivery is unavailable. Late delivery may produce both an observation and its later audit incident; only the audit event can authorize enforcement.

Owner and bot self-actions are exempt. Failed member/role lookup, database errors, insufficient hierarchy and unavailable permissions prevent unsafe effects. Discord log delivery failures are local warnings; the durable incident remains available through `/guard incidents`.

A persisted pending enforcement decision can survive a crash after Discord accepted the request. It is deliberately not replayed automatically. Check the live member/server state and the local incident record before a manual follow-up. Do not delete deduplication records merely to force a retry.

## Backup coverage

Snapshots contain:

- Ordinary and managed role metadata, including permissions; managed roles are recorded but not recreated or edited.
- Guild text, voice, category and announcement channels, their parent relationships, supported channel settings and permission overwrites.
- Guild name, verification level, explicit content filter and default notification setting.
- Snapshot identity, creation time and skipped channel metadata.

The snapshot is a structural recovery aid. It is not a full server archive. Role positions/member role assignments, message history, membership, guild icons, forum/stage channels and threads are not restored. Assets and external resources such as webhook credentials, integrations, emoji/sticker images and soundboard audio are not included.

## Safe restoration

Start with `/guard backup restore id:<snapshot-id> scope:<scope>`. The preview states counts and limitations. The configured instance owner must confirm within the session lifetime. A repeated click cannot repeat that same confirmation.

Restoration is additive/update based: it changes supported existing objects and creates missing ones, without deleting extra objects. Existing permission overwrites may be replaced by snapshot values; this can change channel visibility. Review the snapshot's age and purpose before confirming.

Roles are restored before channels in `all` scope; categories are restored before child channels. Durable old-to-new ID mappings connect channel parents and role overwrites after replacement creation. Deleted objects always receive new Discord IDs. If you restore channels alone and a referenced role/category is absent, the affected channel fails instead of silently dropping its permissions or parent relationship.

Permissions and hierarchy are checked. Requests exceeding the bot's permissions or targeting managed/higher roles are skipped or reported. Some objects may succeed while others fail. Inspect the operation result and `recovery_jobs` journal before retrying. There is no automatic rollback of a partially applied restore.

Before creating a replacement, the bot records a pending operation. If the request or process fails after sending it, the result may be uncertain. The bot refuses to repeat an uncertain create, preventing accidental duplicates. An operator must compare the journal, mappings and live Discord objects, then reconcile the operation deliberately. There is currently no Discord command for editing these low-level recovery journal records; stop the bot and use an appropriate SQLite administration tool if manual reconciliation is needed. Preserve an offline database copy first.

A successful earlier creation that later disappeared is also not silently recreated through the same journal entry. Review why it disappeared and reconcile before another restore.

## Automatic reversal

The `reverse` policy supports audited role name/permission changes and selected guild name/security/notification changes. It requires recent authoritative attribution, reliable old/new values and an exact match between the live state and the audited new state. Concurrent later edits cause refusal rather than overwriting them blindly. Unsupported fields cause refusal, not a guessed partial reversal.

Automatic reverse is not a general restore system. Deleted channels/roles, icons, membership, webhook/integration operations, emoji/sticker assets, threads and soundboard content require another recovery approach where possible. Use snapshots for the supported structural cases.

## Retention and local data

Incident retention defaults to 30 days; backup retention to 10 snapshots. Scheduled backups default to disabled. Configure these through the panel. Cleanup and due checks run periodically while the process is connected/running. An outage does not produce the missed intermediate snapshots after startup.

SQLite uses WAL mode. To make a filesystem backup, stop the bot cleanly and copy the database and any remaining SQLite sidecar files together, or use SQLite's supported online backup mechanism. Copying only the live main `.sqlite` file can omit committed WAL data. A Discord structural snapshot stored inside the same SQLite file is not an independent off-host database backup.

Restrict filesystem access: an operator who can alter the database can alter security configuration. Do not commit data files, snapshots, `.env`, logs or tokens. To inspect a database, prefer read-only mode. Recovery records and mappings should not be purged casually because they preserve idempotency evidence.

## Logs

Local Pino JSON logs go to stdout. Under Compose, the supplied logging configuration rotates files at 10 MB and keeps three files. Under systemd or another process manager, configure journal/log rotation there; unrestricted shell redirection can grow indefinitely.

Discord logs are best effort and require a working configured text channel with View Channel, Send Messages and Embed Links. If the channel disappears or permissions change, core incident persistence continues and local logs report the delivery failure. No local token or authorization header should be included in diagnostic reports.

## Troubleshooting

| Symptom                                  | Check                                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot refuses startup                      | Node version, required environment values, writable database directory and local logs.                                                             |
| Invalid token                            | Regenerate it in the Developer Portal and update `.env`; do not share it.                                                                          |
| Disallowed intents / gateway close       | Ensure portal intents match enabled environment flags. Core protection can run with both privileged flags disabled.                                |
| `/guard` is absent                       | Application ID, install scopes, registration scope and `pnpm register` output. Global changes can take time to appear.                             |
| Administrator cannot configure           | Runtime management requires BOT_OWNER_ID; guild ownership, Administrator and whitelist do not grant access.                                        |
| No audit incidents                       | View Audit Log, gateway connection, module enabled state and `/guard health`.                                                                      |
| Incident has no executor                 | Attribution is unresolved; inspect audit availability. The bot intentionally avoids a guess.                                                       |
| Module does not punish                   | Both protection modes, policy, threshold, whitelist, owner/self exemptions, hierarchy and current permissions. Raid modules are observations only. |
| No log embed                             | Configured log channel and its View Channel/Send Messages/Embed Links overwrites.                                                                  |
| Panel expired                            | Reopen `/guard panel`; sessions expire and are not persisted across process restart.                                                               |
| Restore partially succeeded              | Read the returned per-object results and recovery job journal. Missing referenced roles/categories are not ignored.                                |
| Restore says uncertain previous creation | Reconcile live objects with the operation journal; automatic retries are blocked.                                                                  |
| Docker cannot write data                 | Named volume ownership, non-root runtime user and `DATABASE_PATH`; do not expose credentials in logs.                                              |
| Reinstall changes dependencies           | Use the committed lockfile and `pnpm install --frozen-lockfile`.                                                                                   |

## Release verification still required

Run all local checks and inspect `PROJECT_STATUS.md`. Before declaring a production release, verify command registration, owner authorization, session expiration, real audit event normalization, permission-loss behavior, supported backups/restores and graceful shutdown on a disposable test guild. Build and run the supplied container and confirm volume persistence. Capture evidence without exposing credentials, and document any Discord capability limitations discovered.

## Reading recovery jobs in Discord

Use `/guard backup jobs` to list recent jobs, then `/guard backup jobs id:<job-id> page:1` to read complete per-resource results. Long jobs are paginated with the page option. Jobs remain guild-scoped and owner-only. A finished job can contain partial failures; read the resource results rather than treating finished as success for every resource.

## UX upgrade deployment

After updating to the bilingual guided UX, run `pnpm register` again: the whitelist command is now a group with add/remove/list, and limits/modules open panels without arguments. Preserve the existing `.env`, SQLite database and volume. The new JSON configuration language field defaults to Turkish when absent; this requires no destructive SQL migration or data reset. Select English or Turkish in General Settings → Language / Dil. Native command labels follow the Discord client's language separately.

Release exercises should test both client locales against both guild response languages, user/role/bot lookup failures, full-access scope display, duplicate/legacy whitelist behavior, limit forms, configured-owner checks after asynchronous lookup, language persistence and real panel acknowledgement/expiry.
