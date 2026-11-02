import { describe, expect, it, vi } from "vitest";
import { createWriter } from "../src/model/queue.ts";

/** A task the test finishes by hand. */
function held() {
  let finish = (): void => undefined;
  const task = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  return {
    task,
    finish: () => {
      finish();
    },
  };
}

describe("the write queue", () => {
  it("runs one write at a time, in order", async () => {
    // Arrange
    const writer = createWriter(() => undefined);
    const first = held();
    const second = vi.fn(() => Promise.resolve());

    // Act
    const a = writer.run("a", first.task);
    const b = writer.run("b", second);
    await Promise.resolve();

    // Assert
    expect(first.task).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    first.finish();
    await Promise.all([a, b]);
    expect(second).toHaveBeenCalledOnce();
  });

  it("lands on the last write of a key, skipping those still waiting", async () => {
    // Arrange
    const writer = createWriter(() => undefined);
    const running = held();
    const skipped = vi.fn(() => Promise.resolve());
    const last = vi.fn(() => Promise.resolve());

    // Act
    const all = [
      writer.run("preset", running.task),
      writer.run("preset", skipped),
      writer.run("preset", last),
    ];
    await Promise.resolve();
    running.finish();
    await Promise.all(all);

    // Assert
    expect(skipped).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledOnce();
  });

  it("keeps a skipped write's place, so other keys stay in order", async () => {
    // Arrange
    const writer = createWriter(() => undefined);
    const running = held();
    const order: string[] = [];
    const log = (name: string) => () => {
      order.push(name);
      return Promise.resolve();
    };

    // Act
    const all = [
      writer.run("x", running.task),
      writer.run("a", log("a old")),
      writer.run("b", log("b")),
      writer.run("a", log("a new")),
    ];
    await Promise.resolve();
    running.finish();
    await Promise.all(all);

    // Assert
    expect(order).toEqual(["a new", "b"]);
  });

  it("reports a failure and goes on to the next write", async () => {
    // Arrange
    const errors: unknown[] = [];
    const writer = createWriter((error) => errors.push(error));
    const boom = new Error("boom");
    const next = vi.fn(() => Promise.resolve());

    // Act
    await Promise.all([
      writer.run("a", () => Promise.reject(boom)),
      writer.run("b", next),
    ]);

    // Assert
    expect(errors).toEqual([boom]);
    expect(next).toHaveBeenCalledOnce();
  });
});
