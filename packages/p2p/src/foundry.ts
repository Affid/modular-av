import type { Channel, ParticipantId } from "@modular-av/api";
import { type FoundryTurn, iceConfiguration } from "./ice.ts";
import type { P2PServiceDeps } from "./service.ts";
import { MODULE_ID, readSettings, type SettingsApi } from "./settings.ts";

/** The slice of Foundry's `game` this module reads. */
export interface FoundryGameSlice {
  readonly settings: SettingsApi;
  readonly users: {
    get(
      id: string,
    ): { readonly id: string; readonly isGM: boolean } | undefined;
  };
  readonly user: { readonly isGM: boolean };
  readonly socket: {
    on(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
  };
  readonly webrtc: {
    readonly settings: { readonly world: { readonly turn: FoundryTurn } };
  } | null;
}

export interface FoundryHooksSlice {
  on(hook: string, fn: (...args: never[]) => void): number;
  off(hook: string, id: number): void;
}

const SESSION_BYTES = 16;

/** WebCrypto's random values work outside secure contexts too (plain http). */
export function randomSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_BYTES));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Browser errors can quote SDP lines: no addresses in the log, one line only. */
export function redact(text: string): string {
  return (text.split("\n")[0] ?? "")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[address]")
    .replace(
      /(?<![\w:])[\da-f]{0,4}(?::[\da-f]{0,4}){2,7}(?![\w:])/gi,
      (match) =>
        match.includes("::") || match.split(":").length > 3
          ? "[address]"
          : match,
    );
}

const turnOf = (game: FoundryGameSlice): FoundryTurn | null =>
  game.webrtc?.settings.world.turn ?? null;

/** Hooks a listener for as long as the caller wants it. */
function listen(
  hooks: FoundryHooksSlice,
  hook: string,
  fn: (...args: never[]) => void,
): () => void {
  const id = hooks.on(hook, fn);
  return () => {
    hooks.off(hook, id);
  };
}

export interface FoundryServiceOptions {
  readonly game: FoundryGameSlice;
  readonly hooks: FoundryHooksSlice;
  readonly channel: Channel;
  readonly onError: (error: unknown) => void;
}

/** What the service needs from Foundry, read at the moment it is needed. */
export function foundryServiceDeps(
  options: FoundryServiceOptions,
): P2PServiceDeps {
  const { game, hooks } = options;
  return {
    channel: options.channel,
    settings: readSettings(game.settings),
    turn: () => turnOf(game),
    // Foundry's own reconnect on a TURN change never fires (handoff §10).
    onIceChange: (listener) =>
      listen(hooks, "updateSetting", (setting: { key?: unknown }) => {
        const key = typeof setting.key === "string" ? setting.key : "";
        if (key === "core.rtcWorldSettings" || key.startsWith(`${MODULE_ID}.`))
          listener();
      }),
    onUserLeft: (listener) =>
      listen(
        hooks,
        "userConnected",
        (user: { id: ParticipantId }, connected: boolean) => {
          if (!connected) listener(user.id);
        },
      ),
    // socket.io's "connect" comes again after every reconnection.
    onReconnect: (listener) => {
      game.socket.on("connect", listener);
      return () => {
        game.socket.off("connect", listener);
      };
    },
    isUser: (id) => game.users.get(id) !== undefined,
    isGM: (id) => game.users.get(id)?.isGM ?? false,
    now: () => Date.now(),
    randomId: randomSessionId,
    onError: options.onError,
  };
}

/** A GM asked for relaying only, but Foundry names no TURN server. */
export function relayWithoutTurn(game: FoundryGameSlice): boolean {
  if (!game.user.isGM || !game.webrtc) return false;
  const settings = readSettings(game.settings);
  if (!settings.relayOnly()) return false;
  return (
    iceConfiguration(turnOf(game), settings).iceTransportPolicy !== "relay"
  );
}
