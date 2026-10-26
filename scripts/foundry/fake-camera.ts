import { mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * A Y4M for Chrome's fake camera (--use-file-for-fake-video-capture),
 * drawn here rather than filmed, so its licence is ours: a person from the
 * chest up (shaded face, hair, neck, shirt) in front of a bookshelf, swaying
 * slowly, with sensor-like noise in every frame (a still picture would give
 * an identical mask every frame). Chrome's own fake camera shows no person.
 * Background detail is fine on purpose: a blur visibly removes it.
 */
export const FAKE_CAMERA_Y4M = join(
  import.meta.dirname,
  "..",
  "..",
  "test-results",
  "fake-camera-person.y4m",
);

export const CAMERA_WIDTH = 640;
export const CAMERA_HEIGHT = 480;
export const CAMERA_FPS = 30;
/** One sway back and forth; Chrome loops the file. */
const LOOP_S = 3;
const SWAY_PX = 12;
const NOISE = 6;

type Rgb = readonly [number, number, number];

/**
 * Points that are the person or the background in every frame, whatever
 * the sway: tests check a mask or an effect's output there.
 */
export const PERSON_POINTS: readonly (readonly [number, number])[] = [
  [320, 200], // face
  [320, 300], // neck
  [320, 420], // chest
  [220, 440], // shoulder
  [420, 440],
];
export const BACKGROUND_POINTS: readonly (readonly [number, number])[] = [
  [40, 40],
  [600, 40],
  [40, 300],
  [600, 300],
  [90, 160],
  [550, 160],
];

const SKIN: Rgb = [222, 170, 138];
const HAIR: Rgb = [58, 38, 28];
const SHIRT: Rgb = [62, 92, 128];
const WALL: Rgb = [196, 182, 160];
const BOOKS: readonly Rgb[] = [
  [150, 40, 40],
  [40, 90, 60],
  [190, 150, 60],
  [50, 60, 110],
  [120, 80, 50],
  [90, 30, 70],
];

const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** Inside an ellipse, as 0 (edge) to 1 (centre), or a negative number. */
const ellipse = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number => 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2;

function background(x: number, y: number): Rgb {
  const shelfTop = 70;
  const shelfRow = 110;
  const row = Math.floor((y - shelfTop) / shelfRow);
  const inRow = (y - shelfTop) % shelfRow;
  if (y < shelfTop || row > 2) {
    // Plaster: fine stripes and grain.
    const grain = 0.94 + 0.06 * Math.sin(x * 1.7 + y * 0.9);
    return shade(WALL, grain);
  }
  if (inRow > 96) return shade([110, 72, 44], 0.9); // the shelf board
  // Books of varying widths and heights, with a light spine stripe.
  const book = Math.floor((x + row * 37) / 23);
  const width = 23;
  const height = 70 + ((book * 53) % 26);
  if (96 - inRow > height) return shade(WALL, 0.7);
  const color = BOOKS[(book * 7 + row) % BOOKS.length] ?? WALL;
  const stripe = (x + row * 37) % width;
  return shade(color, stripe < 2 ? 0.6 : stripe === 11 ? 1.3 : 1);
}

/** The head's light: an ellipsoid lit from the upper left. */
function headLight(x: number, y: number, cx: number, cy: number): number {
  const nx = (x - cx) / 90;
  const ny = (y - cy) / 115;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return 0.45 + 0.6 * Math.max(0, -0.4 * nx - 0.45 * ny + 0.8 * nz);
}

function face(x: number, y: number, cx: number, cy: number): Rgb | null {
  // Eyes, brows, nose shadow and mouth on the skin.
  for (const side of [-1, 1]) {
    const ex = cx + side * 32;
    if (ellipse(x, y, ex, cy - 8, 13, 7) > 0)
      return ellipse(x, y, ex, cy - 8, 5, 5) > 0
        ? [40, 30, 25]
        : [235, 235, 230];
    if (ellipse(x, y, ex, cy - 26, 18, 4) > 0) return HAIR;
  }
  if (ellipse(x, y, cx + 4, cy + 22, 7, 16) > 0)
    return shade(SKIN, 0.78 * headLight(x, y, cx, cy));
  if (ellipse(x, y, cx, cy + 55, 24, 7) > 0) return [170, 80, 80];
  return null;
}

function person(x: number, y: number, t: number): Rgb | null {
  const phase = Math.sin((2 * Math.PI * t) / LOOP_S);
  const hx = 320 + SWAY_PX * phase;
  const hy = 200 + 3 * Math.cos((2 * Math.PI * t) / LOOP_S);
  const bx = 320 + (SWAY_PX / 2) * phase;
  // Hair: a cap over the top of the head and a little volume behind it.
  const head = ellipse(x, y, hx, hy, 88, 112);
  const hairBack = ellipse(x, y, hx, hy - 18, 98, 108);
  const hairline = hy - 52 + 10 * Math.sin((x - hx) / 18);
  if (head > 0) {
    if (y < hairline && head > 0) return shade(HAIR, 0.8 + 0.3 * head);
    return face(x, y, hx, hy) ?? shade(SKIN, headLight(x, y, hx, hy));
  }
  if (hairBack > 0 && y < hy + 30) return shade(HAIR, 0.7 + 0.3 * hairBack);
  // Ears.
  for (const side of [-1, 1])
    if (ellipse(x, y, hx + side * 88, hy + 5, 13, 24) > 0)
      return shade(SKIN, 0.85);
  // Neck, in the head's shadow at the top.
  if (Math.abs(x - (hx + bx) / 2) < 38 && y > hy + 80 && y < 360)
    return shade(SKIN, 0.6 + 0.25 * Math.min(1, (y - hy - 80) / 60));
  // Shoulders and chest: a rounded block, with a V-neck of skin.
  const top = 330;
  if (y > top) {
    const half = 70 + Math.min(110, Math.sqrt((y - top) * 260));
    const dx = Math.abs(x - bx);
    if (dx < half) {
      if (dx < 30 - (y - top) * 0.35 && y < 390) return shade(SKIN, 0.7);
      return shade(SHIRT, 0.75 + 0.35 * (1 - dx / half));
    }
  }
  return null;
}

/** Deterministic noise, so every run writes the same file. */
function noiseSource(): () => number {
  let seed = 7;
  return () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed / 2_147_483_647) * 2 - 1;
  };
}

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** One frame as YUV 4:2:0 (BT.601, limited range), as Y4M's C420 wants. */
function frame(t: number, noise: () => number): Buffer {
  const w = CAMERA_WIDTH;
  const h = CAMERA_HEIGHT;
  const luma = Buffer.alloc(w * h);
  const u = new Float64Array((w / 2) * (h / 2));
  const v = new Float64Array((w / 2) * (h / 2));
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = person(x, y, t) ?? background(x, y);
      const n = NOISE * noise();
      const R = r + n;
      const G = g + n;
      const B = b + n;
      luma[y * w + x] = clamp(16 + 0.257 * R + 0.504 * G + 0.098 * B);
      const c = (y >> 1) * (w / 2) + (x >> 1);
      u[c] = (u[c] ?? 0) + (128 - 0.148 * R - 0.291 * G + 0.439 * B) / 4;
      v[c] = (v[c] ?? 0) + (128 + 0.439 * R - 0.368 * G - 0.071 * B) / 4;
    }
  return Buffer.concat([
    Buffer.from("FRAME\n"),
    luma,
    Buffer.from(Array.from(u, clamp)),
    Buffer.from(Array.from(v, clamp)),
  ]);
}

export function writeFakeCamera(path = FAKE_CAMERA_Y4M): string {
  mkdirSync(dirname(path), { recursive: true });
  const file = openSync(path, "w");
  try {
    writeSync(
      file,
      `YUV4MPEG2 W${String(CAMERA_WIDTH)} H${String(CAMERA_HEIGHT)} F${String(CAMERA_FPS)}:1 Ip A1:1 C420\n`,
    );
    const noise = noiseSource();
    for (let i = 0; i < LOOP_S * CAMERA_FPS; i += 1)
      writeSync(file, frame(i / CAMERA_FPS, noise));
  } finally {
    closeSync(file);
  }
  return path;
}

if (import.meta.main) console.log(writeFakeCamera());
