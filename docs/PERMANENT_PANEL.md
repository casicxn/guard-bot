# Permanent Discord control panel

As the configured BOT_OWNER_ID user, run `/guard panel` inside the chosen guild text or announcement channel. The bot sends one **normal channel message** with the ULTIMATE GUARD Security Control Center embed and native controls. The command itself acknowledges privately with a link; that acknowledgement is not the panel.

Running the command again fetches and refreshes the existing registered message, including when the command is run in another channel. It does not create another panel. Use **Panel Settings** to move it explicitly instead. Each guild has one persisted reference in the existing SQLite records table: panelChannelId, panelMessageId, panelCreatedAt, panelEnabled and panelLanguage, plus schema version, availability and current public view. BOT_OWNER_ID is not copied into this record.

## Permissions and public visibility

The bot needs View Channel, Read Message History, Send Messages and Embed Links in the panel channel. People who can read that channel can see the panel. Only BOT_OWNER_ID can operate it; guild ownership, Administrator and whitelist grant no management access. Unauthorized clicks receive a private Casi-branded denial and never edit the public panel.

The overview shows actual server/mode, available first-action protection count, unavailable module count, unique non-expired whitelist member/bot and role counts, incidents in 24 hours, last confirmed incident type/time, trusted backup readiness, runtime voice state and system health. Counts are not invented. Public summaries omit incident identities and detailed trusted-principal, backup and diagnostic records. Those sections offer **Open Private Management** for sensitive details/actions while keeping a public summary in the registered message. Other normal navigation edits the same channel message.

Enable Protection still invokes the existing centralized Anti-Nuke engine and requires a private explicit confirmation. Monitor stops further automatic effects. Existing whitelist selectors, numerical forms and recovery workflows are preserved. The global bot profile is source-configured and read-only; per-guild voice controls remain editable. Completed private forms/ordinary confirmations return the public panel to the overview when appropriate. Sensitive confirmations expire normally; reopening them does not affect permanent controls.

## Restart and interaction routing

Versioned `ug:v1:panel:...` IDs use the central interactionCreate router, not temporary collectors. The public view lives in SQLite; transient tokens are only used internally to reuse existing action handlers. Context-dependent module controls include a reproducible view signature to reject stale selections. No ten-minute timer disables public navigation.

On readiness/restart, the bot fetches the stored message, verifies it belongs to the current bot and restores its overview. Missing-message recovery defaults to manual; an explicitly saved recoveryBehavior replace permits a single definitive Unknown Message replacement through the existing creation journal. Missing/deleted channels/messages are otherwise marked unavailable; run `/guard panel` in a valid destination as owner to recreate. A reference to a different author's message is refused rather than overwritten or silently replaced. Wrong guild/message/channel, obsolete versions and stale private confirmations fail privately.

If the bot is offline, the channel message remains visible but cannot receive interactions until the process reconnects. Keep one process per token/database.

## Move and pin

Open **Panel Settings**, choose the destination with the native channel selector, then confirm privately. A newly registered message replaces the old reference; the old message's controls are removed and replaced by a link when accessible. Old message IDs immediately lose authority even if retiring the old controls fails. Unrelated messages/pins are never modified.

**Pin Panel** fetches the current message and avoids re-pinning an already pinned panel. The current Discord API requires **Pin Messages**; some deployments also use Manage Messages. The bot checks supported permissions, reports a pin permission failure and keeps the panel operational. It never unpins unrelated messages. See [Discord's pin endpoint](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx#pin-message).

## Updates and failure handling

Durable changes to security mode/settings, whitelist/expiry cleanup, backups/jobs, incidents, presence and voice state publish advisory local events. Refreshes coalesce for 1.5 seconds per guild, edit the existing message and compare normalized payload fingerprints to skip unchanged edits. There is no per-second polling loop. Update failures are logged and isolated from security processing. Unavailable references wait for owner-controlled recovery instead of an automatic message-posting loop.

Creation is serialized, journaled and uses a unique enforced message nonce. A definite API permission rejection can be retried after correction. If a send's outcome is uncertain, the bot refuses to post a possible duplicate. Compare the channel with the `panel_creation/main` journal before manual reconciliation; preserve an offline database copy and do not blindly delete uncertain evidence. Discord and SQLite cannot form one atomic transaction. [Nonce API behavior](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx#create-message) limits nonce deduplication to recent sends; the local journal prevents blind later retries.

SQLite migration 4 registers versioned panel record collections without resetting existing configuration, trust, snapshots, ownership, presence or voice state. No new dependency or `.env` variable is needed. Preserve the existing `.env` and data directory; use Node 24 and pnpm 11.25.0, run `pnpm build`, then `pnpm start`. `pnpm register` remains available for initial/refreshed command registration.

Tests use mock Discord APIs and temporary SQLite files, including production routing, restart, deletion/recreation, non-ephemeral creation, concurrent install, denial, move/pin, private confirmation, localization and refresh failure. Actual Discord rendering/pinning/gateway behavior still needs a controlled live guild. No live deployment or destructive test was performed during this change.

## Reusable management workflows and planned maintenance

Ordinary /guard commands bridge to the canonical message; the first owner command may establish it once. Command acknowledgements contain a link. Public navigation edits the registered message. Sensitive private component selections update their existing private message with deferUpdate; they do not create a new private panel on each click. Modal submissions use a separate private acknowledgement. Back/Main preserve the appropriate private parent or publish the canonical view. Fast requests use view revisions so an obsolete slow render cannot replace a newer view. Invalid optional Restart journals show manual review while unrelated controls remain usable. See [Restart Protection](RESTART_PROTECTION.md) for snapshots, confirmation, startup restore gates and the emergency CLI.
