import { describe, expect, it } from "vitest";
import { webpSize } from "./webp.ts";

const ascii = (text: string): number[] => [...Buffer.from(text, "ascii")];
const u32 = (value: number): number[] => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >> 24) & 0xff,
];
/** A WebP file with one chunk. */
const webp = (kind: string, payload: readonly number[]): Uint8Array =>
  new Uint8Array([
    ...ascii("RIFF"),
    ...u32(4 + 8 + payload.length),
    ...ascii("WEBP"),
    ...ascii(kind),
    ...u32(payload.length),
    ...payload,
  ]);

describe("webpSize", () => {
  it("reads a lossy picture's size from its frame header", () => {
    // Frame tag, start code, then 600 and 1200 in 14 bits each.
    const frame = [0, 0, 0, 0x9d, 0x01, 0x2a, 0x58, 0x02, 0xb0, 0x04];

    expect(webpSize(webp("VP8 ", frame))).toEqual({ width: 600, height: 1200 });
  });

  it("leaves out a lossy picture's scaling bits", () => {
    const frame = [0, 0, 0, 0x9d, 0x01, 0x2a, 0x58, 0xc2, 0xb0, 0x44];

    expect(webpSize(webp("VP8 ", frame))).toEqual({ width: 600, height: 1200 });
  });

  it("reads a lossless picture's size: one less than each, 14 bits apiece", () => {
    const bits = (800 - 1) | ((272 - 1) << 14);

    expect(webpSize(webp("VP8L", [0x2f, ...u32(bits)]))).toEqual({
      width: 800,
      height: 272,
    });
  });

  it("reads the canvas of a picture with transparency: one less than each, 24 bits apiece", () => {
    const canvas = [0x10, 0, 0, 0, 0x7d, 0x04, 0, 0x0d, 0x03, 0];

    expect(webpSize(webp("VP8X", canvas))).toEqual({
      width: 1150,
      height: 782,
    });
  });

  it("refuses what is no WebP picture, or one cut short", () => {
    expect(() => webpSize(new Uint8Array(ascii("<svg/>")))).toThrow(/WebP/);
    expect(() => webpSize(webp("ALPH", [1, 2, 3, 4]))).toThrow(/WebP/);
    expect(() => webpSize(webp("VP8X", [0x10, 0, 0]))).toThrow(/WebP/);
    expect(() =>
      webpSize(webp("VP8 ", [0, 0, 0, 1, 2, 3, 4, 5, 6, 7])),
    ).toThrow(/WebP/);
    expect(() => webpSize(webp("VP8L", [0x2e, 0, 0, 0, 0]))).toThrow(/WebP/);
  });
});
