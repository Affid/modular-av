import type {
  Channel,
  ServiceConnection,
  ServiceContext,
  ServiceDefinition,
  TokenRequest,
} from "@modular-av/api";
import type { JitsiServer } from "./join.ts";
import type { JitsiCredentials } from "./token.ts";

export const MODULE_ID = "modular-av-jitsi";

/** Where the bundled lib-jitsi-meet is served (`modularAV.downloads`). */
export const SDK_PATH = "vendor/lib-jitsi-meet.min.js";

export interface JitsiServiceDeps {
  /** How players get in: tokens a GM's browser signs, or an open server. */
  readonly access: () => "token" | "open";
  /** The deployment, or null while the world settings name none (read lazily). */
  readonly server: () => Promise<JitsiServer | null>;
  /** Why they name none, for the log (read lazily). */
  readonly serverProblem: () => Promise<string>;
  /** This device's app id and secret (a GM's browser), or null. */
  readonly credentials: () => JitsiCredentials | null;
  /** The core's socket for this module: who is who on an open server. */
  readonly channel: Channel;
  /** Someone in an open room isn't in the world (a GM is told). */
  readonly onOutsider: () => void;
  /** How long an unknown participant has to be vouched for (tests). */
  readonly outsiderGraceMs?: number;
  /** Foundry's socket connected again: who is who is said again. */
  readonly onReconnect: (listener: () => void) => () => void;
  readonly sdkUrl: () => string;
  readonly now: () => number;
  readonly onError: (error: unknown) => void;
  /** lib-jitsi-meet's own warnings and errors, one line each. */
  readonly onLibraryLog: (line: string) => void;
}

/** WebCrypto exists only in secure contexts (https, or localhost). */
const canUseWebCrypto = (): boolean =>
  typeof (globalThis.crypto as Partial<Crypto> | undefined)?.subtle
    ?.importKey === "function";

/** A token signed on this device (a GM's browser): the token code loads here. */
function signWith(
  deps: JitsiServiceDeps,
  request: TokenRequest,
): Promise<string> {
  if (!canUseWebCrypto())
    return Promise.reject(
      new Error(
        "Signing Jitsi tokens needs a secure context: open Foundry over https:// (or localhost)",
      ),
    );
  const credentials = deps.credentials();
  if (!credentials)
    return Promise.reject(
      new Error("No Jitsi app id and secret on this device"),
    );
  return import("./token.ts").then(({ signJitsiToken }) =>
    signJitsiToken(request, credentials, deps.now()),
  );
}

/** No server in the settings: why, for good. */
async function noServer(deps: JitsiServiceDeps): Promise<never> {
  const [{ JitsiServiceError }, message] = await Promise.all([
    import("./errors.ts"),
    deps.serverProblem(),
  ]);
  throw new JitsiServiceError({ code: "unsupported", final: true, message });
}

/** The connection, with the SDK and the connection code loaded first. */
async function connect(
  deps: JitsiServiceDeps,
  context: ServiceContext,
  server: JitsiServer,
  joinedAt: () => number,
): Promise<ServiceConnection> {
  const [{ loadJitsi }, { createJitsiConnection }] = await Promise.all([
    import("./sdk.ts"),
    import("./connection.ts"),
  ]);
  const sdk = await loadJitsi(deps.sdkUrl(), deps.onLibraryLog);
  return createJitsiConnection(context, {
    sdk,
    server,
    now: deps.now,
    onError: deps.onError,
    openRoom: {
      channel: deps.channel,
      joinedAt: joinedAt(),
      onOutsider: deps.onOutsider,
      onReconnect: deps.onReconnect,
      ...(deps.outsiderGraceMs === undefined
        ? {}
        : { outsiderGraceMs: deps.outsiderGraceMs }),
    },
  });
}

/**
 * What the module registers with the core: small on purpose. The SDK (a
 * prebuilt script) and the connection code load in `create()`, the token
 * code in `signToken()`.
 */
export function createJitsiService(deps: JitsiServiceDeps): ServiceDefinition {
  const open = (): boolean => deps.access() === "open";
  /** This page's first join: its tabs are ordered by it (open servers). */
  let firstJoin: number | null = null;
  const joinedAt = (): number => (firstJoin ??= deps.now());
  return {
    id: "jitsi",
    label: `${MODULE_ID}.label`,
    // An open server needs none: Foundry's server names every sender.
    needsToken: () => !open(),
    canSignTokens: () =>
      !open() && deps.credentials() !== null && canUseWebCrypto(),
    signToken: (request) => signWith(deps, request),
    async create(context) {
      const server = await deps.server();
      return server ? connect(deps, context, server, joinedAt) : noServer(deps);
    },
  };
}
