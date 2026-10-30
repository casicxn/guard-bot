import { parseArgs } from "node:util";
export function parseRecoveryArguments(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      guild: { type: "string" },
      session: { type: "string" },
      confirm: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help) return { help: true as const };
  if (!values.guild || !/^[1-9]\d{16,19}$/.test(values.guild))
    throw new Error("--guild requires a valid Discord guild ID");
  for (const id of [values.session, values.confirm])
    if (id !== undefined && !/^[a-f0-9]{24}$/.test(id))
      throw new Error(
        "Session IDs must match the saved 24-character hexadecimal ID",
      );
  if (values.session && values.confirm && values.session !== values.confirm)
    throw new Error("--confirm must match --session");
  return {
    help: false as const,
    guildId: values.guild,
    sessionId: values.session,
    confirm: values.confirm,
  };
}
