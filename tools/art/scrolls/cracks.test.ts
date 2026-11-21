import { describe, expect, it } from "vitest";
import { isWellFormed, pathPoints } from "../vines/svg.ts";
import { drawCracks } from "./cracks.ts";
import { STONES, VIEW } from "./geometry.ts";

describe("the cracks in the stones of a player who is out of the call", () => {
  const cracks = STONES.map((_, scroll) => drawCracks(scroll));

  it("are drawn for each scroll's own stones, over the whole frame layer", () => {
    expect(new Set(cracks).size).toBe(STONES.length);
    for (const picture of cracks) {
      expect(isWellFormed(picture)).toBe(true);
      expect(picture).toContain(
        `viewBox="${VIEW.left} ${VIEW.top} ${VIEW.right - VIEW.left} ${VIEW.bottom - VIEW.top}"`,
      );
    }
  });

  it("are the same every time", () => {
    expect(drawCracks(0)).toBe(cracks[0]);
  });

  it("cross every stone, and stay on it", () => {
    STONES.forEach((stones, scroll) => {
      stones.forEach((stone, i) => {
        const points = pathPoints(cracks[scroll] ?? "", `crack-${i}`);
        const far = points.map(([x, y]) =>
          Math.hypot(x - stone.x, y - stone.y),
        );

        expect(points.length).toBeGreaterThan(8);
        // From near its middle to its rim; the stylesheet cuts them to the stone's own shape.
        expect(Math.min(...far)).toBeLessThan(stone.radius * 0.35);
        expect(Math.max(...far)).toBeGreaterThan(stone.radius * 0.85);
        expect(Math.max(...far)).toBeLessThan(stone.radius * 1.2);
      });
    });
  });

  it("are dark, with a light edge where a crack's lip catches the light", () => {
    for (const picture of cracks) {
      expect(picture).toContain('stroke="#15101a"');
      expect(picture).toContain('stroke="#fff"');
    }
  });
});
