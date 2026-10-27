import { MODULE_ID } from "../../constants.ts";
import type { BoardHost } from "../host.ts";
import { type Piece, pieceOf, type Socket } from "../pieces.ts";

const KEY = `${MODULE_ID}.modules`;

/** The family's prefix on catalog titles: "Modular A/V — LiveKit". */
const TITLE_PREFIX = /^Modular A\/V\s*[—–-]\s*/u;

export interface Texts {
  /** A board string, under `modular-av.modules`. */
  t(key: string, data?: Readonly<Record<string, string>>): string;
  /** A module's short name: the core's own words, else its catalog title. */
  name(id: string): string;
  /** What a piece does, in a line. */
  what(piece: Piece): string;
  /** "A, B and C". */
  list(names: readonly string[]): string;
  /** "LiveKit and Dock", by id. */
  names(ids: readonly string[]): string;
  socketLabel(socket: Socket): string;
  socketNeed(socket: Socket): string;
  socketEmpty(socket: Socket): string;
}

const socketKind = (socket: Socket): string =>
  socket.parent === null ? socket.key.replace("core.", "") : "theme";

export function createTexts(
  host: Pick<BoardHost, "t" | "doc">,
  pieces: readonly Piece[],
  soon: readonly { readonly id: string; readonly title: string }[],
): Texts {
  const t = (key: string, data?: Readonly<Record<string, string>>): string =>
    host.t(`${KEY}.${key}`, data);
  // Foundry answers an unknown key with the key itself.
  const own = (key: string): string | null => {
    const value = host.t(`${KEY}.${key}`);
    return value === `${KEY}.${key}` ? null : value;
  };
  const name = (id: string): string =>
    own(`names.${id}.title`) ??
    (pieceOf(pieces, id) ?? soon.find((s) => s.id === id))?.title.replace(
      TITLE_PREFIX,
      "",
    ) ??
    id;
  const format = new Intl.ListFormat(host.doc.documentElement.lang || "en", {
    type: "conjunction",
  });
  const list = (names: readonly string[]): string => format.format(names);
  const parentName = (s: Socket): string => (s.parent ? name(s.parent) : "");
  return {
    t,
    name,
    what: (piece) => own(`names.${piece.id}.what`) ?? piece.description,
    list,
    names: (ids) => list(ids.map(name)),
    socketLabel: (s) =>
      t(`socket.${socketKind(s)}.label`, { name: parentName(s) }),
    socketNeed: (s) => t(`socket.${socketKind(s)}.need`),
    socketEmpty: (s) =>
      t(`socket.${socketKind(s)}.empty`, { name: parentName(s) }),
  };
}
