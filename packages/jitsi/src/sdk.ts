import type { JitsiMeetJS, LogTransport } from "./sdk-types.ts";

declare global {
  var JitsiMeetJS: JitsiMeetJS | undefined;
}

/**
 * lib-jitsi-meet's own ids (a machine id it sends to the server, a stats
 * name) stay in memory, not in Foundry's localStorage.
 */
function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  let items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      items = new Map(items).set(key, value);
    },
    removeItem(key) {
      const next = new Map(items);
      next.delete(key);
      items = next;
    },
  };
}

/**
 * Only what Jitsi needs: no analytics, statistics or logs sent anywhere.
 * Connection measurements every 5 s (10 by default), for the dock.
 */
export const INIT_OPTIONS = {
  enableAnalyticsLogging: false,
  disableThirdPartyRequests: true,
  analytics: { disabled: true, rtcstatsEnabled: false, watchRTCEnabled: false },
  pcStatsInterval: 5000,
} as const;

function addScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`lib-jitsi-meet didn't load from ${url}`));
    });
    document.head.append(script);
  });
}

/** Longest piece of a logged object kept: logs are for people. */
const MAX_PART = 500;

function textOf(part: unknown): string {
  if (typeof part === "string") return part;
  if (part instanceof Error) return part.message;
  try {
    return JSON.stringify(part).slice(0, MAX_PART);
  } catch {
    // A cyclic or otherwise unprintable object.
    return String(part);
  }
}

/**
 * lib-jitsi-meet logs to the console by default, including what it
 * expects (a server without TURN credentials) and what can carry the
 * token (the WebSocket URL holds it). Its warnings and errors go through
 * the module's own log instead, one redacted line each.
 */
function routeLogs(sdk: JitsiMeetJS, log: (line: string) => void): void {
  const line = (...parts: unknown[]): void => {
    log(`lib-jitsi-meet: ${parts.map(textOf).join(" ")}`);
  };
  const transport: LogTransport = { warn: line, error: line };
  sdk.removeGlobalLogTransport(console);
  sdk.addGlobalLogTransport(transport);
  sdk.setGlobalLogOptions({ disableCallerInfo: true });
}

let loading: Promise<JitsiMeetJS> | null = null;

/**
 * Loads the bundled lib-jitsi-meet once per page (it is a prebuilt
 * script that sets `window.JitsiMeetJS`) and initializes it.
 */
export function loadJitsi(
  url: string,
  log: (line: string) => void,
): Promise<JitsiMeetJS> {
  loading ??= addScript(url).then(() => {
    const sdk = globalThis.JitsiMeetJS;
    if (!sdk) throw new Error("lib-jitsi-meet loaded without JitsiMeetJS");
    routeLogs(sdk, log);
    sdk.init({ ...INIT_OPTIONS, externalStorage: memoryStorage() });
    sdk.setLogLevel(sdk.logLevels.ERROR ?? "error");
    return sdk;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
