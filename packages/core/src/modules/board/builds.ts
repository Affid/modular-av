import type { Piece } from "../pieces.ts";
import { withPiece } from "../plan.ts";
import type { Choice } from "./chain.ts";
import type { BoardState } from "./state.ts";

/** How much a build asks, from one to three pips. */
export type Pips = 1 | 2 | 3;

/** A common setup that fills the chain in one click; its words are in lang. */
export interface Build {
  readonly id: "browsers" | "livekit" | "jitsi";
  readonly service: string;
  readonly modules: readonly string[];
  readonly tableSize: Pips;
  readonly setup: Pips;
  /** Its ribbon: "Quickest", "Most tables". */
  readonly tag: "quickest" | "mostTables" | null;
}

const DOCK = "modular-av-dock";

export const BUILDS: readonly Build[] = [
  {
    id: "browsers",
    service: "modular-av-p2p",
    modules: ["modular-av-p2p", DOCK],
    tableSize: 1,
    setup: 1,
    tag: "quickest",
  },
  {
    id: "livekit",
    service: "modular-av-livekit",
    modules: ["modular-av-livekit", DOCK, "modular-av-mic-denoise"],
    tableSize: 3,
    setup: 2,
    tag: "mostTables",
  },
  {
    id: "jitsi",
    service: "modular-av-jitsi",
    modules: ["modular-av-jitsi", DOCK],
    tableSize: 2,
    setup: 3,
    tag: null,
  },
];

/** The builds whose modules the catalog has. */
export const buildsFor = (pieces: readonly Piece[]): readonly Build[] =>
  BUILDS.filter((b) =>
    b.modules.every((id) => pieces.some((p) => p.id === id)),
  );

/** The chain filled with a build, keeping the effects and theme chosen. */
export function withBuild(state: BoardState, build: Build): Choice {
  let plan = state.plan;
  let dropped: readonly string[] = [];
  for (const id of build.modules) {
    const next = withPiece(plan, id, state.pieces);
    plan = next.plan;
    dropped = [...dropped, ...next.dropped];
  }
  return { plan, dropped, added: [] };
}
