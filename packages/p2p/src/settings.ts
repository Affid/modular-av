export const MODULE_ID = "modular-av-p2p";

/** The public STUN servers Foundry's own P2P client (SimplePeer) uses. */
export const DEFAULT_STUN =
  "stun:stun.l.google.com:19302, stun:global.stun.twilio.com:3478";

/** Each link encodes the camera once more: CPU is the real limit. */
export const PARTICIPANTS = { min: 2, max: 10, default: 6 } as const;

/** The slice of `game.settings` this module uses. */
export interface SettingsApi {
  register(
    namespace: string,
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void;
  get(namespace: string, key: string): unknown;
}

export interface P2PSettings {
  /** How many may be in the call, GMs included (they are always let in). */
  maxParticipants(): number;
  /** Used when Foundry has no TURN server of the GM's own. */
  stunServers(): readonly string[];
  /** Send everything through Foundry's TURN server: hides players' addresses. */
  relayOnly(): boolean;
}

const STUN_URL = /^stuns?:(\[[\da-f:.]+\]|[\w.-]+)(:\d{1,5})?$/i;

/** World scope: the GM's choices for the table; none of them is secret. */
export function registerSettings(settings: SettingsApi): void {
  const setting = (
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void => {
    settings.register(MODULE_ID, key, {
      name: `${MODULE_ID}.settings.${key}.name`,
      hint: `${MODULE_ID}.settings.${key}.hint`,
      scope: "world",
      config: true,
      ...config,
    });
  };
  setting("maxParticipants", {
    type: Number,
    range: { min: PARTICIPANTS.min, max: PARTICIPANTS.max, step: 1 },
    default: PARTICIPANTS.default,
  });
  setting("stunServers", { type: String, default: DEFAULT_STUN });
  setting("relayOnly", { type: Boolean, default: false });
}

export function readSettings(settings: SettingsApi): P2PSettings {
  const get = (key: string): unknown => settings.get(MODULE_ID, key);
  return {
    maxParticipants() {
      const value = get("maxParticipants");
      if (typeof value !== "number" || !Number.isFinite(value))
        return PARTICIPANTS.default;
      return Math.min(
        PARTICIPANTS.max,
        Math.max(PARTICIPANTS.min, Math.floor(value)),
      );
    },
    stunServers() {
      const value = get("stunServers");
      if (typeof value !== "string") return [];
      return value.split(/[\s,]+/).filter((url) => STUN_URL.test(url));
    },
    relayOnly: () => get("relayOnly") === true,
  };
}
