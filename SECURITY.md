# Security policy

This project is not yet a verified production release. Use monitor mode while validating it in a controlled guild. Discord permissions, audit availability, gateway disconnects and API limits constrain protection.

Do not disclose tokens, private incident records, or exploitable vulnerabilities in public issues. Use the repository maintainer's private security reporting channel when the repository is published. No private reporting address is configured yet; request one without posting exploit details. Rotate exposed bot tokens in the Discord Developer Portal immediately.

Only the account configured by BOT_OWNER_ID may change guard policies through management commands. Guild ownership and Administrator permission do not independently authorize management. The actual guild owner remains exempt from enforcement. Protect the hosting account and SQLite file: local filesystem access grants control of guard configuration. Backups contain guild structure and permission metadata. Keep a filesystem backup of SQLite while the bot is stopped, or use SQLite's online backup facilities; copying an active WAL database file alone is not a complete backup.

Default mode is monitor. Never assume Administrator grants bot authority over guild owners or higher roles. Crash-interrupted enforcement is not automatically replayed, because the external result may be ambiguous. Inspect persisted incidents and recovery jobs before retrying manually.
