// A WebP picture's size, read from its header: the rendered pictures are
// checked against the measures they were rendered for without a decoder.
import type { Size } from "./geometry.ts";

const HEADER = 12;
const CHUNK_HEADER = 8;
/** What a lossy frame's data starts with, after its three-byte tag. */
const START_CODE = [0x9d, 0x01, 0x2a] as const;
const LOSSLESS_SIGNATURE = 0x2f;
const FOURTEEN_BITS = 0x3fff;

const text = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + length));

function refuse(why: string): never {
  throw new Error(`Not a WebP picture this tool can read: ${why}`);
}

function lossy(view: DataView): Size {
  const started = START_CODE.every((byte, i) => view.getUint8(3 + i) === byte);
  if (!started) refuse("its frame has no start code");
  return {
    width: view.getUint16(6, true) & FOURTEEN_BITS,
    height: view.getUint16(8, true) & FOURTEEN_BITS,
  };
}

function lossless(view: DataView): Size {
  if (view.getUint8(0) !== LOSSLESS_SIGNATURE)
    refuse("its lossless data has no signature");
  const bits = view.getUint32(1, true);
  return {
    width: (bits & FOURTEEN_BITS) + 1,
    height: ((bits >> 14) & FOURTEEN_BITS) + 1,
  };
}

const uint24 = (view: DataView, at: number): number =>
  view.getUint16(at, true) | (view.getUint8(at + 2) << 16);

const extended = (view: DataView): Size => ({
  width: uint24(view, 4) + 1,
  height: uint24(view, 7) + 1,
});

/** The first chunk's kind, how to read a size from it, and how much of it that takes. */
const READERS: Readonly<
  Record<string, { readonly needs: number; read(view: DataView): Size }>
> = {
  "VP8 ": { needs: 10, read: lossy },
  VP8L: { needs: 5, read: lossless },
  VP8X: { needs: 10, read: extended },
};

export function webpSize(bytes: Uint8Array): Size {
  if (
    bytes.length < HEADER + CHUNK_HEADER ||
    text(bytes, 0, 4) !== "RIFF" ||
    text(bytes, 8, 4) !== "WEBP"
  )
    refuse("it has no WebP header");
  const kind = text(bytes, HEADER, 4);
  const reader = READERS[kind];
  if (!reader) refuse(`its first chunk is ${JSON.stringify(kind)}`);
  const start = HEADER + CHUNK_HEADER;
  if (bytes.length < start + reader.needs) refuse("it is cut short");
  return reader.read(
    new DataView(bytes.buffer, bytes.byteOffset + start, reader.needs),
  );
}
