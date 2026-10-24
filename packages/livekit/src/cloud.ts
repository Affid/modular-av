/** Named in `ServiceCapabilities.features` while on LiveKit Cloud. */
export const CLOUD_FEATURE = "livekit-cloud";

/**
 * `ServerInfo_Edition.Cloud` from @livekit/protocol, which livekit-client
 * doesn't re-export. Kept apart from the SDK so the entry stays small.
 */
const CLOUD_EDITION = 1;

/** What a server offers beyond the basics, from what it says when joined. */
export function featuresOf(
  serverInfo: { readonly edition?: unknown } | undefined,
): readonly string[] {
  return Number(serverInfo?.edition) === CLOUD_EDITION ? [CLOUD_FEATURE] : [];
}
