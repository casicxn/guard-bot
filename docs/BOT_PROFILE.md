# Source-configured bot profile

Edit **src/configuration/bot-profile.ts**. It is the single editable profile configuration; neither SQLite nor Discord controls override it.

```ts
export const botProfile = Object.freeze({
  status: "dnd",
  activityType: "custom",
  activityText: "Protecting Servers",
  aboutMe:
    "Ultimate Guard | Professional Discord Protection. Developed by Casi.",
  syncAboutMeOnStartup: true,
} satisfies BotProfileConfig);
```

Keep the existing imports/interface/validation in that file; edit the object's values. Then rebuild and restart with Node 24:

```powershell
pnpm build
pnpm start
```

Use Ctrl+C to stop an existing foreground process before starting the new build. No new environment variable, database reset or profile command is needed.

## Supported values

- status: online, idle, dnd, invisible.
- activityType: playing, watching, listening, competing, custom, none.
- activityText: up to 128 characters without control characters; nonblank when an activity is enabled. Custom uses ActivityType.Custom with state. None clears activity.
- aboutMe: application description, at most 400 characters. This is separate from presence/activity text.
- syncAboutMeOnStartup: true enables one startup description synchronization attempt; false leaves application description management to the Developer Portal.

Types use the installed discord.js interfaces/enums, with runtime validation. A completely invalid configuration logs a local warning and is not partially applied; security continues. Unsupported bot custom emoji and user bio/selfbot endpoints are not used. Profile text is global developer-controlled content; per-guild localization applies to UI labels, not this configured free text.

## Application description / About Me

When ready, the manager applies the configured presence. If synchronization is enabled, it fetches ClientApplication, compares its current description and calls the official ClientApplication.edit({description}) only when different. An unchanged or disabled description is not written. Repeated readiness events do not create a timer/update loop. A failed attempt logs a warning without claiming success and is not retried until restart.

Manual fallback: **Discord Developer Portal → application → General Information → Description**. Use this when synchronization is disabled or the API is unavailable. Restart after correcting a failed automatic configuration, or update manually. Discord clients may require refresh/cache propagation before changes appear. No live profile update was performed during development.

References: [discord.js ClientApplication](https://discordjs.dev/docs/packages/discord.js/14.27.0/ClientApplication:Class), [official description field guidance and 400-character limit](https://github.com/discord/discord-api-docs/blob/main/developers/discovery/best-practices.mdx#app-general-information-description).

## Existing data and controls

Old `$global/runtime/presence` records are left intact and ignored. Tests reopen SQLite and verify that those records and unrelated whitelist/voice settings remain unchanged while source configuration wins.

The permanent panel retains a **read-only Bot Profile** view. Status selectors, activity text/custom status forms, reset/remove buttons and their event routes are removed. Old controls cannot change the source profile. Direct legacy service update/reset calls are rejected after ownership validation. **Voice connection controls remain editable**, including channel ID, connect/reconnect/disconnect, auto-join, mute and deaf.
