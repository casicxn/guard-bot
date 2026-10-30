import { en as startup } from "./catalogs/startup.js";
import { en as recoveryCli } from "./catalogs/recovery-cli.js";
import { en as restart } from "./catalogs/restart.js";
import { en as commands } from "./catalogs/commands.js";
import { en as activity } from "./catalogs/activity.js";
import { en as profile } from "./catalogs/profile.js";
import { en as antinuke } from "./catalogs/antinuke.js";
import { en as persistent } from "./catalogs/persistent.js";
import { en as response } from "./catalogs/response.js";
import { en as control } from "./catalogs/control.js";
import { en as runtime } from "./catalogs/runtime.js";
import { en as ownership } from "./catalogs/ownership.js";
import { en as common } from "./catalogs/common.js";
import { en as modules } from "./catalogs/modules.js";
import { en as panel } from "./catalogs/panel.js";
import { en as whitelist } from "./catalogs/whitelist.js";
import { en as operations } from "./catalogs/operations.js";
export const en: Record<string, string> = {
  ...startup,
  ...recoveryCli,
  ...restart,
  ...common,
  ...modules,
  ...panel,
  ...whitelist,
  ...operations,
  ...ownership,
  ...runtime,
  ...control,
  ...antinuke,
  ...response,
  ...persistent,
  ...activity,
  ...profile,
  ...commands,
};
