# Slash command reference

Commands run inside a server. Commands have no default Administrator restriction. Every route requires the single BOT_OWNER_ID user; server ownership, Administrator and whitelist grant no management privileges. The main panel and ordinary navigation edit one persistent public channel message using registered guild/channel/message IDs and versioned controls. Private modal/confirmation sessions remain owner/guild-bound, expire after ten minutes and reset on restart.

## Language and command names

Responses default to Turkish. Open `/guard panel` → General Settings → Language / Dil to select Turkish or English for the server. The change is immediate and persists in SQLite.

Discord displays command names/descriptions according to the individual's Discord client locale, independently of the selected server response language. All command and option definitions provide `tr` and `en-US` metadata. English examples below use stable internal names; Turkish clients display equivalents such as `/guard beyaz-liste ekle hedef:<ID>` and `/guard limitler`.

## Commands

| Command                   | Required input | Behavior                                                                            |
| ------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `/guard setup`            | None           | Optionally choose the security notice channel; existing settings are preserved.     |
| `/guard panel`            | None           | Create or refresh the guild's permanent channel panel; return its link.             |
| `/guard status`           | None           | Show mode, enabled protections, real recent incident count and permission warnings. |
| `/guard health`           | None           | Check current permissions, connection and monitoring availability.                  |
| `/guard help`             | None           | Read explanations of protections, modes, trust, limits, backups and languages.      |
| `/guard incidents`        | None           | Read incident history; `page` is optional.                                          |
| `/guard modules`          | None           | Choose a protection by its readable name and adjust its settings.                   |
| `/guard limits`           | None           | Choose a protection, read its explanation and edit limits using a form.             |
| `/guard mode`             | `value`        | Choose Monitor or Protect from friendly choices.                                    |
| `/guard whitelist add`    | `subject`      | Recognize a server user/bot/role ID and trust it for all protections.               |
| `/guard whitelist remove` | `subject`      | Revoke saved trust for the ID, including a departed member.                         |
| `/guard whitelist list`   | None           | Display saved trust, scope and expiry.                                              |
| `/guard lockdown`         | `enabled`      | Raise verification or restore its saved prior level.                                |
| `/guard backup create`    | None           | Save supported structure. Also available through the panel.                         |
| `/guard backup list`      | None           | Display backups; the panel offers restore selection.                                |
| `/guard backup restore`   | `id`           | Preview a selected backup and request one-use confirmation; scope is optional.      |
| `/guard backup jobs`      | None           | List recovery results; `id` and `page` optionally select full details.              |

## Limits and protection settings

No internal module identifiers need to be typed. Select a protection from the menu, read what it protects, whether it is enabled, its response and its action window. The modal accepts whole numbers: 1–10000 matching actions and 1–86400 seconds. Five actions in sixty seconds can trigger the configured response on the fifth matching action, after all security checks pass.

The protection selector paginates all available protections. Account-age monitoring explains its fixed age rule instead of offering an unsupported limit form. Raid observations stay monitoring-only. Audit protections default to enabled, Monitor mode and record-only response; optional raid observations default to disabled.

| Response                  | Meaning                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Record only               | Store the incident without automatic intervention.                                                                |
| Security warning          | Record a warning and attempt delivery to the notice channel.                                                      |
| Remove dangerous roles    | Remove manageable dangerous roles from the confirmed executor, preserving ordinary roles.                         |
| Kick executor             | Kick the confirmed executor if permissions/hierarchy allow it.                                                    |
| Ban executor              | Ban the confirmed executor without requesting message deletion.                                                   |
| Raise verification        | Set Very High verification; existing members are not frozen.                                                      |
| Reverse supported changes | Revert only supported audited fields after fresh-state validation. Unsupported reversals report their limitation. |

The owner-confirmed one-click zero-tolerance profile activates every eligible administrative protection and acts on the first confirmed unauthorized event. Saved module thresholds/actions apply to legacy selective configuration; they cannot weaken the global profile. Attribution, whitelist, owner/self exemptions, permissions and hierarchy always apply. See [Anti-Nuke behavior and rollback limits](ANTI_NUKE.md).

## Whitelist

```text
/guard whitelist add subject:<ID>
/guard whitelist remove subject:<ID>
/guard whitelist list
```

The ID is the only argument. Roles are resolved in the current server first; otherwise the bot resolves a current member and distinguishes human users from bots. Discord lookup failure does not grant trust. Unknown/outside-server IDs are rejected. New additions grant all protection modules permanently, and the success embed explicitly displays that scope.

Only the configured BOT_OWNER_ID user can grant or revoke access. All-module trust is sensitive: add only trusted principals. A trusted role grants its access to members currently holding it. Bots have no automatic trust.

An already permanent unrestricted entry is reported as a duplicate without creating a copy. Re-adding an existing scoped or expiring entry asks for separate upgrade confirmation before granting unrestricted permanent trust; its saved identity is preserved. Other old entries are kept. Advanced action-specific and expiring permissions remain supported by the Security Engine internally; the simplified command does not request them.

## Panel sections

Security Overview, Protection Settings, Whitelist Management, Security Limits, Backup & Restore, Incident History, Bot Presence, Voice Settings, General Settings, System Health and Help. Views provide Back, Main Menu and Refresh. Lists paginate and incidents filter by critical, unresolved and failed outcomes. Success, warning and error embeds use a consistent color and localized Casi footer.

All management is available from `/guard panel`: native user/role and channel selections, limit and retention forms, grouped protection controls, backup create/details/scope/preview/confirmed restore/delete and recovery journals. General Settings includes language, notice channel, global mode, notifications, developer information and confirmed reset. Emergency verification is in the Security Mode view and requires confirmation. Reset keeps existing records, runtime settings and active emergency verification; restore verification separately.

Bot Profile is read-only. Edit src/configuration/bot-profile.ts, rebuild and restart to change global status/activity/application description. Voice Settings controls this guild's channel, auto-join, connect/disconnect/reconnect and self-mute/deaf. See [runtime operation details](OPERATIONS.md#presence-and-persistent-voice).

Settings preserve these ranges: history 1–3650 days, backup count 1–100 and backup interval 0–8760 hours. Zero disables scheduling. Backups run only while the bot is running. Restore scopes cover roles, channels, server settings or all supported settings; read the preview and [recovery limitations](OPERATIONS.md) before confirmation.

## Re-register after updating

Run `pnpm register` with your existing local environment. `DISCORD_GUILD_ID` selects development-guild registration; omit it for global registration. Restart with the new build. Starting the bot alone does not update the command schema. This rework changes the whitelist command tree, so re-registration is required.
