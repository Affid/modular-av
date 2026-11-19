import type { Channel, ServiceDefinition } from "@modular-av/api";
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

/**
 * What the module registers with the core: small on purpose. The SDK (a
 * prebuilt script) and the connection code load in `create()`, the token
 * code in `signToken()`.
 */
export function createJitsiService(deps: JitsiServiceDeps): ServiceDefinition {
  const open = (): boolean => deps.access() === "open";
  /** This page's first join: its tabs are ordered by it (open servers). */
  let firstJoin: number | null = null;
  return {
    id: "jitsi",
    label: `${MODULE_ID}.label`,
    // An open server needs none: Foundry's server names every sender.
    needsToken: () => !open(),
    canSignTokens: () =>
      !open() && deps.credentials() !== null && canUseWebCrypto(),
    signToken(request) {
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
    },
    async create(context) {
      const server = await deps.server();
      if (!server) {
        const { JitsiServiceError } = await import("./errors.ts");
        throw new JitsiServiceError({
          code: "unsupported",
          final: true,
          message: open()
            ? "Set the Jitsi room link in the module settings, such as https://meet.example.com/OurTable (letters, digits, - and _ in the room name)"
            : "Set the Jitsi server in the module settings",
        });
      }
      const [{ loadJitsi }, { createJitsiConnection }] = await Promise.all([
        import("./sdk.ts"),
        import("./connection.ts"),
      ]);
      const sdk = await loadJitsi(deps.sdkUrl(), deps.onLibraryLog);
      const joinedAt = (firstJoin ??= deps.now());
      return createJitsiConnection(context, {
        sdk,
        server,
        now: deps.now,
        onError: deps.onError,
        openRoom: {
          channel: deps.channel,
          joinedAt,
          onOutsider: deps.onOutsider,
          onReconnect: deps.onReconnect,
          ...(deps.outsiderGraceMs === undefined
            ? {}
            : { outsiderGraceMs: deps.outsiderGraceMs }),
        },
      });
    },
  };
}
