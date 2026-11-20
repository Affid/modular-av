import { describe, expect, it } from "vitest";
import { createRandom } from "./random.ts";

describe("createRandom", () => {
  it("gives the same numbers for the same seed", () => {
    const a = createRandom(7);
    const b = createRandom(7);

    const drawn = [a.next(), a.next(), a.next()];

    expect(drawn).toEqual([b.next(), b.next(), b.next()]);
  });

  it("gives other numbers for another seed", () => {
    expect(createRandom(7).next()).not.toBe(createRandom(8).next());
  });

  it("stays from 0 up to 1, and spreads over it", () => {
    const random = createRandom(3);

    const drawn = Array.from({ length: 500 }, () => random.next());

    expect(Math.min(...drawn)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drawn)).toBeLessThan(1);
    expect(Math.min(...drawn)).toBeLessThan(0.05);
    expect(Math.max(...drawn)).toBeGreaterThan(0.95);
  });

  it("draws between two bounds", () => {
    const random = createRandom(5);

    const drawn = Array.from({ length: 100 }, () => random.between(-2, 6));

    expect(Math.min(...drawn)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...drawn)).toBeLessThan(6);
  });

  it("picks every item of a list in time", () => {
    const random = createRandom(9);

    const picked = new Set(
      Array.from({ length: 60 }, () => random.pick(["a", "b", "c"])),
    );

    expect(picked).toEqual(new Set(["a", "b", "c"]));
  });
});
