import pino, { type Logger } from "pino";
import { resolve } from "node:path";
import { formatConsoleRecord, type LogRecord } from "./formatter.js";
import { RotatingFileSink } from "./file-sink.js";
export {
  formatConsoleRecord,
  recordCategory,
  CATEGORY_COLORS,
} from "./formatter.js";

export interface LoggerConfiguration {
  LOG_LEVEL: string;
  LOG_FORMAT?: "pretty" | "json";
  LOG_LANGUAGE?: "tr" | "en";
  LOG_TO_FILE?: "true" | "false";
  LOG_DIRECTORY?: string;
  LOG_MAX_BYTES?: number;
  LOG_RETENTION_FILES?: number;
}
export interface LoggerDependencies {
  output?: { write: (line: string) => unknown; isTTY?: boolean };
  environment?: NodeJS.ProcessEnv;
  secretValues?: string[];
}
const closers = new WeakMap<Logger, () => Promise<void>>();
const secretKey =
  /token|secret|password|passwd|authorization|authentication|^auth$|cookie|credential|api.?key|private.?key/i;

/** Redact nested keys and credentials embedded in messages/errors before either output. */
export function redactRecord(
  record: unknown,
  secrets: readonly string[] = [],
): unknown {
  if (typeof record === "string") {
    let text = record;
    for (const secret of secrets)
      if (secret.length >= 8) text = text.split(secret).join("[REDACTED]");
    return text
      .replace(/\b(?:Bot|Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, "[REDACTED]")
      .replace(
        /\b(?:mfa\.[\w-]{20,}|[\w-]{24,}\.[\w-]{6}\.[\w-]{20,})\b/g,
        "[REDACTED]",
      )
      .replace(
        /\b(token|secret|password|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi,
        "$1=[REDACTED]",
      );
  }
  if (Array.isArray(record))
    return record.map((value) => redactRecord(value, secrets));
  if (record && typeof record === "object")
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        secretKey.test(key) ? "[REDACTED]" : redactRecord(value, secrets),
      ]),
    );
  return record;
}

/** Same Pino API in dev and production; optional diagnostics never throw into Guard. */
export function createLogger(
  options: LoggerConfiguration,
  dependencies: LoggerDependencies = {},
): Logger {
  const output = dependencies.output ?? process.stdout;
  const environment = dependencies.environment ?? process.env;
  const language = options.LOG_LANGUAGE ?? "tr";
  const secrets = [
    ...(dependencies.secretValues ?? []),
    ...Object.entries(environment)
      .filter(
        ([key, value]) =>
          secretKey.test(key) && Boolean(value) && value!.length >= 8,
      )
      .map(([, value]) => value!),
  ];
  const colors =
    environment.NO_COLOR === undefined &&
    environment.TERM !== "dumb" &&
    (environment.FORCE_COLOR !== undefined
      ? environment.FORCE_COLOR !== "0"
      : output.isTTY === true);
  const write = (line: string) => {
    try {
      output.write(line);
    } catch {
      /* Optional console cannot interrupt security. */
    }
  };
  const warn = (reason: "file" | "queue") => {
    const msg =
      language === "tr"
        ? reason === "file"
          ? "Tanı dosyasına yazılamıyor; konsol ve güvenlik devam ediyor."
          : "Tanı dosyası kuyruğu dolu; bazı dosya kayıtları atlandı. Konsol kayıtları devam ediyor."
        : reason === "file"
          ? "Diagnostic file unavailable; console and security continue."
          : "Diagnostic file queue full; some file records skipped. Console events continue.";
    const record = { time: Date.now(), level: 40, category: "WARNING", msg };
    write(
      options.LOG_FORMAT === "json"
        ? JSON.stringify(record) + "\n"
        : formatConsoleRecord(record, { language, colors }),
    );
  };
  const file =
    options.LOG_TO_FILE === "true"
      ? new RotatingFileSink(
          resolve(options.LOG_DIRECTORY ?? "logs"),
          warn,
          options.LOG_MAX_BYTES,
          options.LOG_RETENTION_FILES,
        )
      : undefined;
  const logger = pino(
    {
      level: options.LOG_LEVEL,
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      },
      base: undefined,
    },
    {
      write(chunk: string) {
        try {
          for (const line of chunk.split("\n")) {
            if (!line) continue;
            const record = redactRecord(JSON.parse(line), secrets) as LogRecord;
            const structured = JSON.stringify(record) + "\n";
            write(
              options.LOG_FORMAT === "json"
                ? structured
                : formatConsoleRecord(record, {
                    language,
                    colors,
                    format: options.LOG_FORMAT ?? "pretty",
                  }),
            );
            file?.write(structured);
          }
        } catch {
          write(
            language === "tr"
              ? "[WARNING] Günlük kaydı biçimlendirilemedi; güvenlik devam ediyor.\n"
              : "[WARNING] Log formatting failed; security continues.\n",
          );
        }
      },
    },
  );
  closers.set(logger, async () => {
    await file?.close();
  });
  return logger;
}
export async function closeLogger(logger: Logger): Promise<void> {
  await closers.get(logger)?.();
}
