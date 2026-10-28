import type { Catalog, CatalogModule } from "../src/catalog/catalog.ts";
import type { BoardState } from "../src/modules/board/state.ts";
import { piecesOf } from "../src/modules/pieces.ts";
import type { WorldModules } from "../src/modules/steps.ts";

export const LIVEKIT = "modular-av-livekit";
export const P2P = "modular-av-p2p";
export const JITSI = "modular-av-jitsi";
export const DOCK = "modular-av-dock";
export const DENOISE = "modular-av-mic-denoise";
export const BACKGROUND = "modular-av-cam-background";
export const VINES = "modular-av-dock-vines";
export const KRISP = "modular-av-livekit-krisp";

const url = (id: string) =>
  `https://raw.githubusercontent.com/Affid/modular-av/manifests/${id}/module.json`;

const mod = (
  id: string,
  kind: CatalogModule["kind"],
  requires: readonly string[] = ["modular-av"],
): CatalogModule => ({
  id,
  title: `Modular A/V — ${id}`,
  description: `${id} does things.`,
  kind,
  version: "0.5.0",
  manifest: url(id),
  requires: requires.map((r) => ({ id: r, minimum: "0.5.0" })),
});

export const catalog: Catalog = {
  schema: 1,
  modules: [
    mod("modular-av", "core", []),
    { ...mod(LIVEKIT, "service"), icon: "fa-solid fa-tower-broadcast" },
    {
      ...mod(P2P, "service"),
      facts: [{ label: "Table size", value: "Up to 6 players" }],
    },
    mod(JITSI, "service"),
    mod(DOCK, "ui"),
    mod(DENOISE, "effect"),
    mod(BACKGROUND, "effect"),
    mod(VINES, "theme", ["modular-av", DOCK]),
  ],
  soon: [
    {
      id: KRISP,
      title: "Modular A/V — Krisp",
      description: "Krisp.",
      kind: "effect",
      requires: [],
    },
  ],
};

/** "running", "off" (installed), or a version with a state: "off@0.4.0". */
export type WorldSpec = Readonly<Record<string, string>>;

export function worldOf(spec: WorldSpec): WorldModules {
  return new Map(
    Object.entries({ "modular-av": "running", ...spec }).map(([id, s]) => {
      const [state, version] = s.split("@");
      return [id, { active: state === "running", version: version ?? "0.5.0" }];
    }),
  );
}

/** A board state over the fixture's catalog: what the world runs, planned. */
export function stateOf(
  spec: WorldSpec,
  plan?: readonly string[],
  extra: Partial<BoardState> = {},
): BoardState {
  const world = worldOf(spec);
  const running = Object.entries(spec)
    .filter(([, s]) => s.startsWith("running"))
    .map(([id]) => id);
  return {
    loaded: {
      catalog,
      source: "bundled",
      known: new Set(catalog.modules.map((m) => m.id)),
    },
    pieces: piecesOf(catalog),
    world,
    plan: new Set(plan ?? running),
    history: [],
    trip: null,
    confirming: null,
    helperOpen: false,
    answer: null,
    chatSent: false,
    checked: new Set(),
    ...extra,
  };
}
