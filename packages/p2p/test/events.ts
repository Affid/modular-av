/** A service event's arguments as short text: `alice:microphone`, `full`. */
export function describeArgs(args: readonly unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg !== "object" || arg === null) return String(arg);
      const fields = arg as {
        readonly participant?: unknown;
        readonly source?: unknown;
        readonly code?: unknown;
      };
      if (typeof fields.source === "string")
        return `${String(fields.participant)}:${fields.source}`;
      return String(fields.code);
    })
    .join(" ");
}
