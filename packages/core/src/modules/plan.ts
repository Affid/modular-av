import { type Piece, pieceOf, socketOf } from "./pieces.ts";

/** The modules the GM wants running, by id. */
export type Plan = ReadonlySet<string>;

/** Pieces in the plan that hang off `id` (a theme off its dock). */
const hangingOff = (plan: Plan, id: string, pieces: readonly Piece[]) =>
  [...plan].filter((other) => {
    const piece = pieceOf(pieces, other);
    return piece !== undefined && socketOf(piece).parent === id;
  });

/**
 * The plan with `id` on the board. A single socket holds one piece: the
 * one already there goes back to the tray, with what hangs off it.
 */
export function withPiece(
  plan: Plan,
  id: string,
  pieces: readonly Piece[],
): { readonly plan: Plan; readonly dropped: readonly string[] } {
  const piece = pieceOf(pieces, id);
  if (!piece || plan.has(id)) return { plan, dropped: [] };
  const socket = socketOf(piece);
  const replaced = socket.single
    ? [...plan].filter((other) => {
        const p = pieceOf(pieces, other);
        return p !== undefined && socketOf(p).key === socket.key;
      })
    : [];
  const dropped = replaced.flatMap((o) => [o, ...hangingOff(plan, o, pieces)]);
  const next = new Set([...plan].filter((o) => !dropped.includes(o)));
  return { plan: new Set([...next, id]), dropped };
}

/** The plan without `id`, and without what hangs off it. */
export function withoutPiece(
  plan: Plan,
  id: string,
  pieces: readonly Piece[],
): { readonly plan: Plan; readonly removed: readonly string[] } {
  if (!plan.has(id)) return { plan, removed: [] };
  const removed = [id, ...hangingOff(plan, id, pieces)];
  return {
    plan: new Set([...plan].filter((o) => !removed.includes(o))),
    removed,
  };
}
