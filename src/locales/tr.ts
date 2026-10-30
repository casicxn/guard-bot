import { tr as startup } from "./catalogs/startup.js";
import { tr as recoveryCli } from "./catalogs/recovery-cli.js";
import { tr as restart } from "./catalogs/restart.js";
import { tr as commands } from "./catalogs/commands.js";
import { tr as activity } from "./catalogs/activity.js";
import { tr as profile } from "./catalogs/profile.js";
import { tr as antinuke } from "./catalogs/antinuke.js";
import { tr as persistent } from "./catalogs/persistent.js";
import { tr as response } from "./catalogs/response.js";
import { tr as control } from "./catalogs/control.js";
import { tr as runtime } from "./catalogs/runtime.js";
import { tr as ownership } from "./catalogs/ownership.js";
import { tr as common } from "./catalogs/common.js";
import { tr as modules } from "./catalogs/modules.js";
import { tr as panel } from "./catalogs/panel.js";
import { tr as whitelist } from "./catalogs/whitelist.js";
import { tr as operations } from "./catalogs/operations.js";
export const tr: Record<string, string> = {
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
