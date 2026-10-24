/** JWTs (service tokens) and `token=` query values, wherever they appear. */
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

/**
 * Foundry modules report to the browser console; this is the dock's one
 * place. Errors that pass through it (a service's, a command's) may carry
 * tokens, so it prints redacted text.
 */
export function reportError(error: unknown): void {
  const text =
    error instanceof Error
      ? (error.stack ?? `${error.name}: ${error.message}`)
      : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: Dock | ${redact(text)}`);
}
