import type { ServiceDefinition } from "@modular-av/api";
import { JitsiServiceError } from "./errors.ts";
import type { JitsiServer } from "./join.ts";
import { type JitsiCredentials, signJitsiToken } from "./token.ts";

export const MODULE_ID = "modular-av-jitsi";

/** Where the bundled lib-jitsi-meet is served (`modularAV.downloads`). */
export const SDK_PATH = "vendor/lib-jitsi-meet.min.js";

export interface JitsiServiceDeps {
  /** The deployment, or null while the world settings name none. */
  readonly server: () => JitsiServer | null;
  /** This device's app id and secret (a GM's browser), or null. */
  readonly credentials: () => JitsiCredentials | null;
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
 * prebuilt script) and the connection code load in `create()`.
 */
export function createJitsiService(deps: JitsiServiceDeps): ServiceDefinition {
  return {
    id: "jitsi",
    label: `${MODULE_ID}.label`,
    mediaOwnership: "core",
    needsToken: () => true,
    canSignTokens: () => deps.credentials() !== null && canUseWebCrypto(),
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
      return signJitsiToken(request, credentials, deps.now());
    },
    async create(context) {
      const server = deps.server();
      if (!server)
        throw new JitsiServiceError({
          code: "unsupported",
          final: true,
          message: "Set the Jitsi server in the module settings",
        });
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
      });
    },
  };
}
