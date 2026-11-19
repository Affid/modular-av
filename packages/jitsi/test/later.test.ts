import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounced } from "../src/later.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("work that waits for things to settle", () => {
  it("runs once, a while after the last call", () => {
    let runs = 0;
    const soon = debounced(() => {
      runs += 1;
    }, 1000);

    soon();
    vi.advanceTimersByTime(600);
    soon();
    vi.advanceTimersByTime(999);
    const early = runs;
    vi.advanceTimersByTime(1);
    soon();
    vi.advanceTimersByTime(1000);

    expect(early).toBe(0);
    expect(runs).toBe(2);
  });
});
