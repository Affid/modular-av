import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundryUser } from "../src/foundry/globals.ts";
import type { AudioSubscription } from "../src/media/audio-copies.ts";
import { announceVoiceCopies } from "../src/voices/announce.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const TRANSCRIBER: AudioSubscription = {
  moduleId: "transcriber",
  participant: "p1",
  source: "microphone",
};

/** This browser's subscriptions, and a user whose saves fail as told. */
function announcing(saves: readonly ("fail" | "ok")[]) {
  let subscriptions: readonly AudioSubscription[] = [];
  let changed = (): void => undefined;
  const errors: unknown[] = [];
  let save = 0;
  const setFlag = vi.fn(() =>
    saves[save++] === "fail"
      ? Promise.reject(new Error("socket"))
      : Promise.resolve(),
  );
  const user = { getFlag: () => [], setFlag } as unknown as FoundryUser;
  announceVoiceCopies({
    copies: {
      subscriptions: () => subscriptions,
      onSubscriptions(listener) {
        changed = listener;
        return () => undefined;
      },
    },
    user: () => user,
    onError: (e) => errors.push(e),
  });
  const subscribe = (next: readonly AudioSubscription[]): void => {
    subscriptions = next;
    changed();
  };
  return { setFlag, errors, subscribe };
}

describe("announcing a browser's modules", () => {
  it("saves once more a little later when saving fails", async () => {
    // Arrange
    const { setFlag, errors, subscribe } = announcing(["fail", "ok"]);

    // Act
    subscribe([TRANSCRIBER]);
    await vi.advanceTimersByTimeAsync(0);
    const afterFailure = setFlag.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);

    // Assert
    expect(afterFailure).toBe(1);
    expect(errors).toHaveLength(1);
    expect(setFlag).toHaveBeenCalledTimes(2);
    expect(setFlag.mock.calls[1]).toEqual(setFlag.mock.calls[0]);
  });

  it("gives up after the second failure, until the next change", async () => {
    const { setFlag, errors, subscribe } = announcing(["fail", "fail", "ok"]);

    subscribe([TRANSCRIBER]);
    await vi.advanceTimersByTimeAsync(60_000);
    subscribe([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(errors).toHaveLength(2);
    expect(setFlag).toHaveBeenCalledTimes(3);
  });
});
