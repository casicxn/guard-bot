# One-click Anti-Nuke protection

Open `/guard panel` as BOT_OWNER_ID. Security Overview shows mode, available first-action protections, unavailable modules and missing permissions, last incident, last fully contained executor, recovery health and trusted snapshot readiness.

Select **Enable Protection / Korumayı Aktifleştir**, review the fresh health check and Full Protection Mode confirmation, then confirm. One centralized operation activates every eligible administrative module. Earlier disabled flags, thresholds and log-only actions cannot block this profile. Individual preferences remain saved separately and can be edited in Monitor. New installations remain Monitor until explicit activation; existing selective legacy configurations remain compatible until this profile is enabled.

**Switch to Monitor Mode / İzleme Moduna Geç** stops further automatic effects and keeps monitoring. Pending activation is cancelled immediately; Discord requests already sent cannot be recalled. Events predating activation are observed without retroactive punishment. Protect and its activation timestamp survive restart.

## First confirmed violation

1. Validate exact guild/action/executor/target, audit identity and event age. Uncertain attribution never punishes. Member departure is never assumed to be a kick.
2. Exempt self, global bot owner, actual guild owner and fresh action-scoped user/role/bot whitelist. Bots have no blanket trust.
3. Persist the decision, fetch fresh member/roles and remove manageable roles granting dangerous effective guild/channel permissions. Preserve harmless roles; never edit shared roles to punish one member.
4. Recheck remaining effective permissions, including everyone, managed/higher roles and channel/member overrides. Incomplete or unverifiable containment is critical, never complete success.
5. Run target-specific rollback in a separate bounded queue, revalidate exact audit evidence, refuse newer target changes and recheck mode/whitelist before effects. Slow restore/notifications do not delay the next executor's containment.
6. Persist outcomes and operation journals. Durable dedupe prevents replay after restart. Previously contained attackers are not automatically rearmed by role restoration.

Dangerous permissions include Administrator, Manage Server/Channels/Roles/Webhooks/Messages/Expressions/Events/Threads, Kick/Ban Members, Moderate Members and Create Expressions, verified against the installed SDK. Discord hierarchy still applies; managed/higher roles and the actual guild owner cannot be forcibly moderated.

Chat, reactions and voice participation do not enter the administrative policy. Self-service invites, thread actions and optional raid observations remain monitoring-only in this profile. Other eligible modules attempt containment even when rollback is unsupported.

## Actual rollback coverage

| Action                 | Implemented behavior and limits                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Channel/role create    | Delete only the exact recent unauthorized created target, with identity/time/hierarchy checks. Dangerous role creation uses this strategy even when classified as a permission grant.                                                                                 |
| Channel delete         | Recreate only that supported channel from a valid pre-incident approved snapshot, including parent/overwrite dependencies, position and supported fields; save new-ID mapping. Missing dependencies refuse creation. Messages and some category links remain partial. |
| Role delete            | Recreate ordinary properties/permissions, attempt position, restore up to 250 assignments only from complete trusted membership evidence, remap supported overwrites and save mapping. Skip contained attackers. Partial results stay visible.                        |
| Channel update         | Reverse supported audited name/topic/NSFW/slowmode/bitrate/user-limit/position/parent fields only while live values still match; preserve unrelated changes.                                                                                                          |
| Channel overwrite      | Reverse only the validated principal and exact permission masks for supported create/update/delete records. Missing principal evidence prevents guessing. Other entries remain intact.                                                                                |
| Role update            | Reverse supported audited name/color/hoist/mentionable/permissions; refuse unsafe privilege restoration.                                                                                                                                                              |
| Ban                    | Remove only a confirmed new unauthorized ban with reliable pre-incident absence and current ban/audit evidence. Unbanning does not restore membership.                                                                                                                |
| Unban                  | Re-ban only with trustworthy prior authorized ban state and no later conflicting action; no message deletion.                                                                                                                                                         |
| Kick                   | Contain and record the victim; forced rejoining is impossible. An authorized operator can arrange a safe invitation.                                                                                                                                                  |
| Member role change     | Reverse the exact added/removed delta subject to fresh state/hierarchy. Do not replace all roles or regrant roles to known contained attackers.                                                                                                                       |
| Guild settings         | Supported audited name, verification, content-filter and default-notification fields with exact live-state comparison.                                                                                                                                                |
| Webhook/AutoMod create | Delete only the verified recent newly created target.                                                                                                                                                                                                                 |
| Other actions          | Containment plus explicit unsupported rollback; includes integration operations and unsupported webhook/AutoMod edits/deletes or external assets.                                                                                                                     |

## Trust, snapshots and recovery

First confirmed activation attempts a structural snapshot using the existing backup service, validates it and records approval metadata/checksum. A complete paginated ban list can establish prior ban state; optional member mappings require Members intent and complete fresh fetch. Failure degrades recovery without pretending containment is unavailable too.

Existing approved state is reused on reactivation; toggling modes does not approve modified live data. Exact trusted role/channel/guild old-to-new audit fields can advance a validated copy. Suspicious events quarantine later candidates. Legacy, scheduled and ordinary manual snapshots are not automatically trusted merely because they are recent. The latest valid baseline is pinned against scheduled retention; manual owner deletion can still make it unavailable.

Authorized fields not covered by history, newly created resources after the approved baseline, missing membership evidence and old mappings may require manual recovery. Deleted IDs/messages cannot be recovered. Restoration may be partial. No general Discord transaction or guaranteed preemptive blocking exists.

Automatic and manual structural recovery share the same store-level guild lock. Conflicts refuse competing creates. Pending create journals never blindly repeat uncertain API effects. SDK REST scheduling handles rate limits; queue concurrency/capacity and event age are bounded. No automatic replay after crashes.

SQLite migration 3 registers record versions and supplies missing zeroTolerance defaults while preserving settings, trust, snapshots and owner/presence/voice data. New state uses the existing records table for preferences, containment operations/results, rollback attempts, processing state, approved metadata, quarantine and trusted/configuration history. No new environment variable or dependency is required.

Use Node 24 and pnpm 11.25.0: `pnpm build`, then `pnpm start`. `pnpm register` is available for initial/refreshed command registration. Preserve `.env` and data. Tests use mock APIs and temporary databases; real Discord hierarchy, gateway delivery, rate limits and restoration still require a controlled guild. Destructive production tests and publication were not authorized.

Primary API references: [audit logs](https://github.com/discord/discord-api-docs/blob/main/developers/resources/audit-log.mdx), [guild bans/member roles](https://github.com/discord/discord-api-docs/blob/main/developers/resources/guild.mdx), [channel permissions](https://github.com/discord/discord-api-docs/blob/main/developers/resources/channel.mdx), [permission hierarchy](https://github.com/discord/discord-api-docs/blob/main/developers/topics/permissions.mdx).
