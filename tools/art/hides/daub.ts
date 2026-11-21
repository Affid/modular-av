// A daub of paint put on with a finger: the one mark the hides theme
// draws. The war paint round a picture and the tally marks under a name
// are both made of them.
import type { Random } from "../vines/random.ts";

/** How far a finger goes before its width is set again. */
const STEP = 14;
const FEWEST_STEPS = 5;

const rounded = (value: number): number => Number(value.toFixed(1));

/**
 * A daub from (ax, ay) to (bx, by), `width` wide: full where the finger
 * lands, thin where it lifts, and never quite straight.
 */
export function daub(
  random: Random,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
  width: number,
): string {
  const length = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(FEWEST_STEPS, Math.round(length / STEP));
  const nx = -(by - ay) / length;
  const ny = (bx - ax) / length;
  const phase = random.between(0, 2 * Math.PI);
  const one: string[] = [];
  const other: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const body = Math.min(1, t * 9) * Math.min(1, (1 - t) * 3 + 0.25);
    const half = (width / 2) * body * random.between(0.8, 1.2);
    const drift =
      Math.sin(t * 5 + phase) * width * 0.16 + random.between(-0.8, 0.8);
    const x = ax + (bx - ax) * t + nx * drift;
    const y = ay + (by - ay) * t + ny * drift;
    one.push(
      `${String(rounded(x + nx * half))},${String(rounded(y + ny * half))}`,
    );
    other.unshift(
      `${String(rounded(x - nx * half))},${String(rounded(y - ny * half))}`,
    );
  }
  return `<polygon points="${[...one, ...other].join(" ")}"/>`;
}
