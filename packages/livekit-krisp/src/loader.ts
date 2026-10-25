import { KRISP_VERSION, type KrispModule } from "./krisp.ts";

export const KRISP_URL = `https://cdn.jsdelivr.net/npm/@livekit/krisp-noise-filter@${KRISP_VERSION}/dist/index.js`;
/** SHA-384 of that file in the npm tarball (jsDelivr serves the same bytes). */
export const KRISP_INTEGRITY =
  "sha384-qJGfCEuFzZFT0qizNZZL+1ygDGA8eT+fzFUGvID7cZsZ/hFfB1QQz1nuzvXCEPOc";

export interface LoaderDeps {
  readonly fetch: typeof fetch;
  /** Imports a module from a URL (a blob: URL of the checked file). */
  readonly importUrl: (url: string) => Promise<unknown>;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
}

const BROWSER: LoaderDeps = {
  fetch: (input, init) => globalThis.fetch(input, init),
  importUrl: (url) => import(/* @vite-ignore */ url),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => {
    URL.revokeObjectURL(url);
  },
};

const isKrispModule = (value: unknown): value is KrispModule =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<KrispModule>).KrispNoiseFilter === "function" &&
  typeof (value as Partial<KrispModule>).isKrispNoiseFilterSupported ===
    "function";

/**
 * Downloads LiveKit's Krisp filter from npm, only if its bytes match the
 * pinned hash (the browser checks `integrity`), and imports that exact
 * copy. About 2 MB compressed, so only when a player turns Krisp on.
 */
export async function loadKrisp(
  deps: LoaderDeps = BROWSER,
): Promise<KrispModule> {
  const response = await deps.fetch(KRISP_URL, {
    integrity: KRISP_INTEGRITY,
    credentials: "omit",
    mode: "cors",
  });
  if (!response.ok)
    throw new DOMException(
      `Krisp couldn't be downloaded (HTTP ${String(response.status)})`,
      "NetworkError",
    );
  const url = deps.createObjectURL(
    new Blob([await response.arrayBuffer()], { type: "text/javascript" }),
  );
  try {
    const module = await deps.importUrl(url);
    if (!isKrispModule(module))
      throw new TypeError("The Krisp package isn't what this module expects");
    return module;
  } finally {
    deps.revokeObjectURL(url);
  }
}

/** One download per page; a failed one may be tried again. */
export function createKrispLoader(
  load: () => Promise<KrispModule> = () => loadKrisp(),
): () => Promise<KrispModule> {
  let loading: Promise<KrispModule> | null = null;
  return () => {
    loading ??= load().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  };
}
