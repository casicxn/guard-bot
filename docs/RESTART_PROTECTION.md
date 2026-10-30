# Restart Protection and emergency recovery

Restart Protection is reversible role-permission lockdown for planned maintenance. It is separate from the older emergency verification-level control. It does not restart Node, stop the machine or guarantee protection from a power loss before activation. There is no new environment variable, service or Discord command registration requirement.

## Owner workflow

1. Use the existing permanent panel and open **Restart Protection / Yeniden Başlatma Koruması**.
2. Select **Prepare Lockdown**. This inspects fresh roles, channels, bot permissions/hierarchy and relevant channel overwrites. Preparation stores a decimal-bitfield snapshot and coverage report before any permission change.
3. Open the private snapshot, affected roles and recovery report. Review all gaps and the original/locked permission values. BOT_OWNER_ID alone controls this workflow; guild ownership, Administrator and whitelist do not authorize management.
4. Select **Activate Lockdown** and confirm privately. Fresh role values, hierarchy, bot permissions and the saved plan are checked again before effects. Ordinary permissions stay on the roles; member roles are not removed.
5. Wait for verified **LOCKED**. PARTIAL_FAILURE, missing/unmanageable roles, dangerous overwrite grants or other gaps mean the bot cannot report safe maintenance coverage. Do not treat a requested or pending change as a verified lock.
6. Stop the existing process and restart using `pnpm start` after building. The bot does not stop itself. Guard routes are installed before login. Startup reconciles the active journal before final panel refresh and notification.
7. Permissions return only after the installed Guard is connected and effective Protect Mode passes permission/intent checks. Zero-tolerance additionally requires a trusted recovery baseline. Monitor Mode or unavailable dependencies keep permissions locked and report manual recovery required. Saved security mode is never silently changed.

Manual **Restore Permissions** also requires private confirmation and the same readiness gate. Cancel can finish an untouched prepared snapshot; after any recorded locking operation, Cancel cannot bypass restore confirmation. Use the explicit Restore Permissions workflow.

## Permission safety and coverage

The implementation uses installed PermissionFlagsBits and the existing dangerous-permission mask. Only manageable roles below the bot are candidates. Integration-managed roles are never changed. The bot's own held roles, including everyone when applicable, are preserved conservatively so its restoration permissions cannot be stripped; dangerous held roles appear as coverage gaps. Its platform-owned managed bot role is an intrinsic self exception. The guild owner remains unrestricted.

A bot can only grant permissions it possesses. Preflight and activation therefore reject a target plan when the bot cannot grant back the removed flags; fresh mutation checks repeat grant validation. Administrator is treated as the platform-wide grant capability. This follows the [official Discord permission hierarchy documentation](https://github.com/discord/discord-api-docs/blob/main/developers/topics/permissions.mdx). No permissions are added to Guard automatically.

Explicit dangerous channel overwrite allows are reported conservatively as gaps. This implementation does not mutate overwrites or assume Administrator can be restricted by overwrites. The advanced member-role removal strategy is not implemented/enabled; it never strips every role from members or relies on a complete member cache.

## Journal and crash behavior

Existing SQLite records hold restart_sessions, restart_active, restart_plans and restart_operations. Migration5 only adds schema metadata; existing configurations, whitelist, backups, incidents, panel IDs and voice settings are preserved.

States: IDLE, PREPARING, SNAPSHOTTING, LOCKING, LOCKED, RESTARTING, VERIFYING, RESTORING, COMPLETED, PARTIAL_FAILURE, MANUAL_RECOVERY_REQUIRED. Transitions are durable. The immutable plan has a digest; strict parsing checks guild/session/role identity, decimal bitfields, unique role IDs and exact mask relationships. Historical plans and unfinished journals are retained.

Each external role write has a persisted, read-back pending operation containing previous/intended values before Discord is called. The API result is fetched and verified. If the process dies or a response is uncertain, restart compares actual permissions with the recorded original/locked target. It does not blindly send the same operation again. A prior pending restore with unchanged locked state remains uncertain for review, rather than repeating a possibly still-in-flight permission grant.

Restoration touches only a role with a recorded lockdown operation. An already-original role is recognized without another write. An exact locked role can receive only the flags originally removed by that session, producing its recorded original bitfield. Any unexpected difference, including otherwise legitimate unrelated permission changes, stops automatic restoration for that role. The bot does not overwrite concurrent edits or grant beyond the saved original. Missing roles/hierarchy changes and uncertain results remain visible. Known contained principals are fetched individually before shared-role grants; a restoration that would rearm them is refused. Fresh Guard readiness is rechecked after those lookups and before effects.

Manual/automatic structural recovery and Restart Protection share the existing per-store guild recovery lock. Startup recovery is attempted once per process; errors do not create infinite retry loops. A Discord request already accepted cannot be recalled, and the platform offers no atomic compare-and-set transaction for role permissions. Fresh pre-write comparisons and durable reconciliation narrow that unavoidable race; they cannot eliminate it.

## Emergency CLI

Use the existing `.env` and database. No token or owner override is accepted in command arguments. Stop the main bot before starting this utility. Both runtime entry points acquire a transactional database process lease; a second live owner is refused. A dead local PID can be taken over, while malformed/foreign-host leases require operator review. Docker Compose supplies a stable hostname and records process generation to handle reused container PIDs. Do not share one database between multiple machines or containers running concurrently.

Build, then preview without changing lockdown permissions:

```powershell
Set-Location D:\bot\guard
pnpm build
pnpm recover --guild YOUR_GUILD_ID
```

The preview lists the active session ID, original/locked/current decimal masks and conflicts, using fresh Discord role reads. The temporary client installs the real Security Engine, so ordinary saved Protect policy remains effective while the utility is online. It does not auto-start voice, emit normal startup announcements or restore the public panel as part of preview.

To explicitly authorize restoration of that same active session:

```powershell
pnpm recover --guild YOUR_GUILD_ID --session SESSION_ID --confirm SESSION_ID
```

This still checks Protect readiness, journal integrity, role hierarchy, actual masks and conflicts. It does not force unsafe changes. After the attempt the CLI keeps Guard online in recovery mode; use `/guard panel` for maintenance controls. Prepare a new lockdown before stopping this process to switch back to the normal runtime. Ctrl+C shuts down recovery mode and releases the process lease. Preview-only invocation exits normally without lockdown permission mutations. Session mismatch or missing data causes refusal.

If permissions cannot safely be restored, use the guild owner's Discord **Server Settings → Roles** to compare each affected role against the private snapshot/CLI preview. Restore only recorded removed flags after reviewing conflicts, and verify the bot's hierarchy/permissions. Do not delete the database, alter all role assignments or apply arbitrary permissions to resolve an error. Keep journals for diagnosis. Cross-host database relocation may require clearing only a verified stale process_lease record while both runtimes are stopped; do not delete security data.

## Panel reliability and logs

All `/guard` workflows use the registered canonical panel when available. A first owner command can establish the canonical message once; ordinary navigation edits it. Command acknowledgements carry a link, not another full main panel. Sensitive details and one-use confirmations remain private, bound to the registered message and owner. Back/Main from private workflows return to the correct canonical/private parent. Selectors use fresh builders/options; ordinary navigation no longer depends on a consumed private session. Requested view revisions reject obsolete slow publications while per-guild edit queues serialize writes. Saved settings and the original message ID survive restart.

Invalid optional Restart journals display a manual-review state rather than disabling other panel sections. Stale/deleted references and unauthorized interactions receive localized errors. No new public message is posted by Back/Main/Refresh. Opening a native Discord channel dropdown remains client behavior; the direct voice-channel-ID button provides an alternative.

Console supports existing pretty/JSON, TR/EN, NO_COLOR and bounded optional file logs. New LOCKDOWN/RESTORE categories include real session/state data. A failed voice ready wait now logs one warning per attempt, with a localized timeout reason; distinct retry failures are retained. Retry state no longer appears connecting merely because the SDK still holds a connecting object. This fixes duplicate reporting, not the cause of a real Discord/network voice handshake failure.

Startup notification adds actual Restart Lockdown state and recovery counts to the existing single per-process, per-guild message. Partial/manual/pending recovery is warning status. A recovery report never claims all permissions returned when some roles remain unresolved.

## Live verification still required

Automated tests use temporary databases and mocked Discord APIs. In a controlled guild verify initial snapshot/confirmed activation, actual ordinary/dangerous role bits, coverage-gap reporting, a real planned restart, same panel ID and repeated selectors, exact restoration and conflict refusal, single startup/recovery notification, and voice handshake. Docker deployment and cross-platform filesystem/process behavior also need controlled validation. No destructive production test or live login was performed during development.
