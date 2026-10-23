/** Foundry modules report to the browser console; this is the one place. */
export function logError(error: unknown): void {
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error("Modular A/V |", error);
}
