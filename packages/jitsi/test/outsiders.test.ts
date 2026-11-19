import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOutsiders } from "../src/outsiders.ts";

const GRACE = 15_000;

function setup(stillOutside: (endpoint: string) => boolean = () => true) {
  const told: string[] = [];
  const outsiders = createOutsiders({
    graceMs: GRACE,
    isOutsider: stillOutside,
    onOutsider: (endpoint) => told.push(endpoint),
  });
  return { outsiders, told };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("people in an open room who aren't in the world", () => {
  it("are told of once each, after the grace, if still nobody vouched for them", () => {
    const { outsiders, told } = setup();

    outsiders.watch("ep-x");
    outsiders.watch("ep-x");
    vi.advanceTimersByTime(GRACE - 1);
    const early = [...told];
    vi.advanceTimersByTime(1);
    outsiders.watch("ep-x");
    vi.advanceTimersByTime(GRACE);

    expect(early).toEqual([]);
    expect(told).toEqual(["ep-x"]);
  });

  it("aren't told of when vouched for meanwhile", () => {
    const vouched = new Set<string>();
    const { outsiders, told } = setup((endpoint) => !vouched.has(endpoint));

    outsiders.watch("ep-bob");
    vouched.add("ep-bob");
    vi.advanceTimersByTime(GRACE);

    expect(told).toEqual([]);
  });

  it("aren't told of after they left, or once stopped", () => {
    const { outsiders, told } = setup();

    outsiders.watch("ep-gone");
    outsiders.forget("ep-gone");
    outsiders.watch("ep-later");
    outsiders.stop();
    vi.advanceTimersByTime(GRACE);

    expect(told).toEqual([]);
  });
});
