/**
 * Structured logging. One JSON line per event so logs are queryable on Vercel
 * or any log drain. Never log credentials, session tokens or full prompts.
 */
type Level = "info" | "warn" | "error";

export interface LogFields {
  event: string;
  [key: string]: unknown;
}

export function logEvent(level: Level, fields: LogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    app: "morph",
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logError(event: string, error: unknown, fields: Record<string, unknown> = {}): void {
  logEvent("error", {
    event,
    ...fields,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 4).join(" | ") : undefined,
  });
}
