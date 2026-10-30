# Contributing

Read AGENTS.md and PROJECT_STATUS.md first. Use Node 24 LTS and pnpm 11.25.0.
Run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
Keep security policy independent of Discord adapters. New modules need explicit audit action mapping, actor/target validation, owner/self exemptions and regression tests. Never use real tokens in fixtures or destructive live integration tests without authorization. Document capabilities and unsupported recovery honestly. Submit focused pull requests with validation evidence; do not commit `.env`, database files, snapshots, or node_modules.

User interface contributions must provide matching Turkish and English catalog keys, native command localizations, and branded embeds through the shared factory. Do not add raw technical errors or memorized protection IDs to user flows. Regression tests must retain legacy database/whitelist compatibility and current-owner authorization, including after asynchronous lookups.
