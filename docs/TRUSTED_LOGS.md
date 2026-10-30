# Trusted activity and localized security logs

Confirmed bot-owner, guild-owner, self and scoped user/role/trusted-bot whitelist exemptions remain visible in the configured security notice channel. Their authorization is established by the existing Security Engine before classifying them Safe; no punishment or rollback occurs. Bots have no automatic trust, and uncertain executor attribution never becomes Safe.

| Classification | Turkish            | Exact log color | Meaning                                                                                                                                            |
| -------------- | ------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe           | Güvenli            | #57F287         | Verified executor and exemption.                                                                                                                   |
| Monitored      | İzleniyor          | #FEE75C         | Activity recorded without automatic intervention, including Monitor mode.                                                                          |
| Mitigated      | Müdahale Edildi    | #ED4245         | Verified actual removed roles or successful/partial rollback with resolved API effects, or an explicitly successful supported legacy intervention. |
| Unresolved     | Belirsiz           | #FAA61A         | Unknown attribution/outcome, pending decisions or verification failures before intervention.                                                       |
| Failed         | Müdahale Başarısız | #992D22         | Confirmed unauthorized activity whose attempted intervention failed.                                                                               |

Containment reporting zero removed roles does not prove an intervention. A sent request that timed out is not a successful effect. Partial containment/recovery and remaining risk are reported explicitly; a red Mitigated entry can still require review for remaining failures. Unknown legacy result strings are not guessed to be successful.

Reusable security-log builders localize title, action, executor, target, classification, exemption reason, enforcement and result. Their footer uses the localized Casi signature. Mention parsing is disabled. Pending/final results for one audit ID update one mapped bot-authored Discord message; identical payloads skip duplicate sends/edits. Delivery uses serialized event queues, persistent references and nonce/pending evidence. A send with an uncertain outcome is not blindly repeated. A missing/deleted mapped log message is reported locally instead of posting a possible duplicate. Notifications disabled by the existing guild setting suppress Discord delivery while durable activity/local diagnostics remain.

Records remain in the existing guild-scoped incident history; historical data is not deleted or rewritten. Verified trusted records are filtered out of hostile incident counts/pages and last hostile incident selection. Existing verified legacy exemption results receive the same treatment. The permanent overview's recent activity includes both safe and suspicious entries, with per-entry colored indicators because Discord supports only one primary embed color. Public entries omit executor identities; details remain private.

An unresolved gateway observation that cannot be exactly correlated with a later audit record stays unresolved. The bot does not retrospectively assign an executor merely to make counters look cleaner. Existing audit ID dedupe remains authoritative.

## Localization

The security log channel needs View Channel, Send Messages and Embed Links. Read Message History is also needed to fetch and verify the mapped message before updating pending/final results. Missing permissions are logged locally and do not interrupt security processing.

The permanent panel's **General Settings → Language / Dil** offers 🇹🇷 Türkçe and 🇬🇧 English, with Turkish as default. The guild setting persists in SQLite, updates the same panel and controls future interfaces and security/trusted logs. Native slash metadata follows the Discord client locale independently; command names/descriptions/options/choices now read the same centralized locale catalogs. Existing serialized command definitions are unchanged.

Tests assert exact en/tr key sets, interpolation-placeholder parity, every module's event label and all classification/reason/enforcement keys, runtime UI key references, recursive native command localization, fallback behavior and guild persistence. Developer diagnostic logs and configurable global profile free text are intentionally not translated per guild.
