/** Foundry modules report to the browser console; this is the dock's one place. */
export function reportError(error: unknown): void {
  const text =
    error instanceof Error
      ? (error.stack ?? `${error.name}: ${error.message}`)
      : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: Dock | ${text}`);
}
