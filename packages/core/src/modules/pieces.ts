import type { ModuleKind } from "@modular-av/api";
import type { Catalog } from "../catalog/catalog.ts";
import { MODULE_ID } from "../constants.ts";

/** A module on the assembly board: everything but the core, which is the board. */
export interface Piece {
  readonly id: string;
  readonly kind: ModuleKind;
  readonly title: string;
  readonly description: string;
  /** The latest version released. */
  readonly version: string;
  readonly manifest: string;
  /** Family modules it requires, the core included. */
  readonly requires: readonly string[];
  /** The core version it needs, if it says. */
  readonly needsCore: string | null;
}

/** Where a piece plugs in. */
export interface Socket {
  /** `core.service`, `core.cameras`, `core.effects`, or `<id>.theme`. */
  readonly key: string;
  /** Holds one piece: another one replaces it. */
  readonly single: boolean;
  /** The piece it hangs off (a theme off what it themes), or null for the core. */
  readonly parent: string | null;
}

export const CORE_SOCKETS: Readonly<
  Record<Exclude<ModuleKind, "theme">, Socket>
> = {
  service: { key: "core.service", single: true, parent: null },
  ui: { key: "core.cameras", single: true, parent: null },
  effect: { key: "core.effects", single: false, parent: null },
};

export function socketOf(piece: Piece): Socket {
  if (piece.kind !== "theme") return CORE_SOCKETS[piece.kind];
  const parent = piece.requires.find((id) => id !== MODULE_ID) ?? null;
  return { key: `${parent ?? MODULE_ID}.theme`, single: true, parent };
}

/** The pieces a catalog offers. */
export function piecesOf(catalog: Catalog): readonly Piece[] {
  return catalog.modules.flatMap((m) =>
    m.kind === "core"
      ? []
      : [
          {
            id: m.id,
            kind: m.kind,
            title: m.title,
            description: m.description,
            version: m.version,
            manifest: m.manifest,
            requires: m.requires.map((r) => r.id),
            needsCore:
              m.requires.find((r) => r.id === MODULE_ID)?.minimum ?? null,
          },
        ],
  );
}

export const pieceOf = (
  pieces: readonly Piece[],
  id: string,
): Piece | undefined => pieces.find((p) => p.id === id);
