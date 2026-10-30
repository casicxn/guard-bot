import type { Store } from "../contracts.js";
import { languageFor, t } from "../locales/index.js";
import { UserError } from "./errors.js";
import { operationText } from "./presentation.js";
interface RecoveryJob {
  id: string;
  snapshotId: string;
  scope?: string;
  state: string;
  results?: string[];
  error?: string;
}
export function recoveryJobPage(
  store: Store,
  guildId: string,
  id: string | null,
  page: number,
): { title: string; description: string; footer: string } {
  const language = languageFor(store, guildId);
  if (!Number.isSafeInteger(page) || page < 0)
    throw new UserError("ops.jobs.invalidPage");
  const scope = (value?: string) =>
    value && ["all", "roles", "channels", "guild"].includes(value)
      ? t(language, `ops.scope.${value}`)
      : t(language, "common.unknown");
  const state = (value: string) => t(language, `ops.state.${value}`);
  if (!id) {
    const jobs = store.list<RecoveryJob>(guildId, "recovery_jobs", 8, page * 8);
    return {
      title: t(language, "ops.jobs.title"),
      description:
        jobs
          .map(
            (job) =>
              `${job.id} · ${state(job.state)}\n${t(language, "ops.jobs.snapshot")}: ${job.snapshotId} · ${t(language, "ops.jobs.scope")}: ${scope(job.scope)}`,
          )
          .join("\n\n") || t(language, "ops.jobs.none"),
      footer: t(language, "ops.jobs.page", { page: page + 1 }),
    };
  }
  const job = store.get<RecoveryJob>(guildId, "recovery_jobs", id);
  if (!job) throw new UserError("ops.jobs.notFound");
  const body = [
    `${t(language, "ops.jobs.snapshot")}: ${job.snapshotId}\n${t(language, "ops.jobs.state")}: ${state(job.state)}\n${t(language, "ops.jobs.scope")}: ${scope(job.scope)}`,
    job.error
      ? `${t(language, "ops.jobs.error")}: ${operationText(language, job.error)}`
      : "",
    ...(job.results ?? []).map((result) => operationText(language, result)),
  ]
    .filter(Boolean)
    .join("\n");
  const pages = Math.max(1, Math.ceil(body.length / 3500));
  if (page >= pages) throw new UserError("ops.jobs.pageCount", { pages });
  return {
    title: t(language, "ops.jobs.detail", { id: job.id }),
    description: body.slice(page * 3500, (page + 1) * 3500),
    footer: t(language, "ops.jobs.detailPage", { page: page + 1, pages }),
  };
}
