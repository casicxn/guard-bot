# Console logs and restart recovery

## Console and diagnostic files

Both `pnpm dev` and `pnpm start` use the same Pino logger. Defaults: `LOG_LEVEL=info`, `LOG_FORMAT=pretty`, `LOG_LANGUAGE=tr`, `LOG_TO_FILE=false`. Levels: error, warn, info, debug, trace. Format: pretty or json. Console language tr/en is independent of each guild's saved interface language. `NO_COLOR` disables ANSI colors; redirected output is plain unless FORCE_COLOR requests colors.

Pretty mode shows timestamp, readable category and localized message. Verified exemptions are SAFE even when the underlying administrative action has critical severity. MONITOR means recorded without intervention; MITIGATED requires actual effects. UNRESOLVED never invents an executor; FAILED indicates a confirmed failed attempt. Partial effects retain partial-risk warnings. Names use existing caches only, falling back to IDs; log decoration never fetches Discord data. Failed activities use error level, unresolved/partial outcomes warning level. Higher configured levels intentionally filter less severe messages.

Set `LOG_TO_FILE=true` for asynchronous JSON Lines diagnostics in `LOG_DIRECTORY=./logs`. The default limit is five files of 5 MiB each (`guard.jsonl`, `guard.1.jsonl` through `guard.4.jsonl`). Rotation and retention are bounded. Oversized entries become explicit markers; a bounded 2 MiB queue may skip file records under overload and warns visibly. Console events and durable SQLite incidents remain independent. File failure disables that optional sink for the process and does not stop Guard. Keys containing token/secret/password/authorization/credential and known secret values are redacted before console or file output; do not deliberately log credentials. Normal pretty output omits stacks; diagnostic JSON retains serialized error details after redaction.

## Durable state

`DATABASE_PATH` defaults to `./data/guard.sqlite`, resolved against the project root for both source and compiled builds. Relative custom paths use the same anchor; absolute paths remain absolute. Keep using the existing database when updating. The application does not copy, delete or reset a database to recover from failure. A failed migration rolls back its transaction, closes the handle, reports the failure and stops startup. Repair or restore the existing file before restarting; never delete it as a troubleshooting shortcut.

Settings, Monitor/Protect, zero-tolerance activation time, module preferences/thresholds/policies, notifications, log channel, language, whitelist, backups, journals, incident history, mappings, permanent panel references and voice settings use the same SQLite store. Startup reads them without resetting them. Normal retention still applies. BOT_OWNER_ID stays in environment configuration; obsolete database presence records are preserved and ignored. The source bot-profile file remains authoritative.

## Coordinated startup

Security routing is installed once before login. A single process-owned coordinator starts on the first ready event, waits for panel restoration, source presence and saved voice restoration, then reads actual permission/backup health. Optional restoration has a bounded 20-second observation window; pending or unavailable services remain explicit and keep Guard running. A slow task may finish later; the startup message is a snapshot rather than a continuous status message. Available active protections count administrative modules currently enabled for automatic Protect enforcement; Monitor reports zero automatic protections while monitoring continues.

Startup announcements are independent of the security-incident notificationsEnabled switch. Each guild with an enabled saved panel gets one separate normal startup embed in that panel's saved channel. It uses guild language, actual status and a Discord startup timestamp, with mentions disabled. Green indicates observed healthy readiness; partial readiness uses a warning. It never replaces the panel, edits an older startup announcement or runs again on Gateway reconnect/repeated ready events. Failures and uncertain sends are logged without automatic send retries. Notification failure does not disable protection.

The original panel message is fetched, checked for current bot ownership and edited in place; stable interaction IDs continue routing after restart. Restoration is cached once per process. A missing/deleted channel or missing permissions produces a warning. Missing-message recovery defaults to manual owner `/guard panel`, preserving the established behavior. The optional persisted permanent-panel `recoveryBehavior: "replace"` policy permits at most one replacement attempt after the definitive Discord Unknown Message (10008) response. It never replaces a wrong-author reference or retries an uncertain create; pending creation journals require owner reconciliation. There is no automatic replacement loop or new Discord policy editor.

Voice auto-join, channel, mute, deaf and manual disconnect pause persist. Enabled auto-join validates the channel and permissions, then uses the existing single-connection manager and bounded retries. Disabled auto-join stays disabled. The notification reports connected only when the manager observes Ready, and otherwise pending, paused or unavailable. The bot cannot remain in voice while its process is offline.

## Repeated incidents

Audit Gateway events and delayed channel/role fallback share the Security Engine's durable per-guild audit-ID claims. Identical IDs cannot enforce twice, including across restarts; distinct IDs remain distinct even for the same target/action. Self-generated restoration audits follow existing self exemption and cannot trigger hostile rollback loops. A second listener installation on the same client is rejected. Pending/final phases update the same mapped Discord security message, while the console preserves changed outcomes. No real production event trace was supplied, so there is no claim that previously observed bursts were duplicates: separate audit actions legitimately produce separate lines.

## Operations and troubleshooting

Run from the project root using Node 24 and pnpm 11.25.0:

```powershell
Set-Location D:\bot\guard
pnpm build
pnpm start
```

Development: `pnpm dev`. Existing `.env` credentials are retained; new logger settings are optional and default safely. Rebuild after editing the source bot profile or updating code. Stop the old process before starting a new one with the same token/database. Graceful shutdown drains effects and logs before closing SQLite.

Docker Compose mounts `guard-data` at `/app/data` and `guard-logs` at `/app/logs`. Preserve these volumes during container recreation. Do not use `docker compose down -v` when retaining state. Container stdout rotation is separately configured in compose.yaml. Files remain optional even when the logs volume is mounted.

For no notification, check the saved enabled panel/channel and View Channel, Send Messages, Embed Links. For unavailable panel restoration, check Read Message History and that the saved message belongs to this bot; use owner `/guard panel` when manual recovery is needed. For voice failures, check GuildVoiceStates intent, channel existence, View Channel/Connect, and manual pause. Missing audit permissions, absent trusted recovery baseline or unavailable enforcement permissions must be resolved before treating Protect as healthy. Discord live delivery, permissions, voice handshake and Docker deployment require controlled live verification; automated mocks do not establish those results.
