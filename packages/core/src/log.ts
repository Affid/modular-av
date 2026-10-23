/** JWTs (LiveKit tokens) and `token=` query values, wherever they appear. */
const SECRETS: readonly RegExp[] = [
  /eyJ[\w-]+\.[\w-]+\.[\w-]*/g,
  /((?:access_)?token=)[^&\s"']+/gi,
];

/** Hides tokens in text that may end up in the browser console. */
export function redact(text: string): string {
  return SECRETS.reduce(
    (out, pattern) =>
      out.replace(pattern, (_match, prefix?: string) =>
        typeof prefix === "string" ? `${prefix}[token]` : "[token]",
      ),
    text,
  );
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return redact(String(error));
  const own = redact(error.stack ?? `${error.name}: ${error.message}`);
  return error.cause === undefined
    ? own
    : `${own}\nCaused by: ${describe(error.cause)}`;
}

/**
 * Foundry modules report to the browser console; this is the one place.
 * Errors from services can carry tokens (e.g. in a URL), so it prints
 * redacted text, never the raw objects.
 */
export function logError(error: unknown): void {
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V | ${describe(error)}`);
}
