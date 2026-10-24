import type { EffectContext } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import {
  createEffectRunner,
  type EffectRunner,
  type RunnableDefinition,
  type Started,
} from "../src/media/effect-runner.ts";

interface Instance {
  readonly id: string;
  disposed: boolean;
  dispose(): void;
}

interface Pending {
  readonly context: EffectContext;
  resolve(): Instance;
  reject(error: Error): void;
}

interface Harness {
  readonly runner: EffectRunner<RunnableDefinition>;
  /** Starts waiting to be resolved, by effect id, oldest first. */
  readonly pending: Map<string, Pending[]>;
  /** Each running set handed over, as ids, with what was disposed by then. */
  readonly handovers: { ids: string[]; disposedBefore: string[] }[];
  readonly replaced: string[][];
  readonly errors: unknown[];
  readonly instances: Instance[];
  settle(): Promise<void>;
  resolve(id: string): Promise<Instance>;
  reject(id: string, error: Error): Promise<void>;
  context(id: string): EffectContext;
}

const definition = (
  id: string,
  extra: Partial<RunnableDefinition> = {},
): RunnableDefinition => ({ id, isSupported: () => true, ...extra });

function createHarness(): Harness {
  const pending = new Map<string, Pending[]>();
  const handovers: Harness["handovers"] = [];
  const replaced: string[][] = [];
  const errors: unknown[] = [];
  const instances: Instance[] = [];
  const contexts = new Map<string, EffectContext>();
  const runner = createEffectRunner<RunnableDefinition, Instance>({
    group: (d) => d.exclusiveGroup ?? null,
    start: (d, context) => {
      contexts.set(d.id, context);
      return new Promise<Instance>((resolve, reject) => {
        const entry: Pending = {
          context,
          resolve() {
            const instance: Instance = {
              id: d.id,
              disposed: false,
              dispose() {
                this.disposed = true;
              },
            };
            instances.push(instance);
            resolve(instance);
            return instance;
          },
          reject,
        };
        pending.set(d.id, [...(pending.get(d.id) ?? []), entry]);
      });
    },
    onRunning(running: readonly Started<Instance>[]) {
      handovers.push({
        ids: running.map((r) => r.id),
        disposedBefore: instances.filter((i) => i.disposed).map((i) => i.id),
      });
    },
    onStatus: vi.fn(),
    onReplaced: (ids) => replaced.push([...ids]),
    onError: (error) => errors.push(error),
  });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  const take = (id: string): Pending => {
    const [first, ...rest] = pending.get(id) ?? [];
    if (!first) throw new Error(`${id} is not starting`);
    pending.set(id, rest);
    return first;
  };
  return {
    runner,
    pending,
    handovers,
    replaced,
    errors,
    instances,
    settle,
    async resolve(id) {
      const instance = take(id).resolve();
      await settle();
      return instance;
    },
    async reject(id, error) {
      take(id).reject(error);
      await settle();
    },
    context(id) {
      const context = contexts.get(id);
      if (!context) throw new Error(`${id} never started`);
      return context;
    },
  };
}

const wanted = (...ids: string[]): ReadonlySet<string> => new Set(ids);

describe("effect runner", () => {
  it("starts wanted effects and reports starting, then running", async () => {
    // Arrange
    const h = createHarness();
    const defs = [definition("a"), definition("b")];

    // Act
    h.runner.update(defs, wanted("a"));
    const starting = h.runner.status("a");
    await h.resolve("a");

    // Assert
    expect(starting).toEqual({ status: "starting", error: null });
    expect(h.runner.status("a")).toEqual({ status: "running", error: null });
    expect(h.runner.status("b")).toEqual({ status: "off", error: null });
    expect(h.handovers.map((x) => x.ids)).toEqual([["a"]]);
  });

  it("hands over running effects in definition order", async () => {
    const h = createHarness();
    const defs = [definition("a"), definition("b")];

    h.runner.update(defs, wanted("a", "b"));
    await h.resolve("b");
    await h.resolve("a");

    expect(h.handovers.map((x) => x.ids)).toEqual([["b"], ["a", "b"]]);
  });

  it("never starts unsupported effects, even when isSupported throws", () => {
    const h = createHarness();
    const defs = [
      definition("a", { isSupported: () => false }),
      definition("b", {
        isSupported: () => {
          throw new Error("no WebAssembly");
        },
      }),
    ];

    h.runner.update(defs, wanted("a", "b"));

    expect(h.runner.status("a").status).toBe("unsupported");
    expect(h.runner.status("b").status).toBe("unsupported");
    expect(h.pending.size).toBe(0);
  });

  it("stops an effect no longer wanted: handed over first, disposed after", async () => {
    const h = createHarness();
    const defs = [definition("a")];
    h.runner.update(defs, wanted("a"));
    const a = await h.resolve("a");

    h.runner.update(defs, wanted());

    expect(h.handovers.at(-1)).toEqual({ ids: [], disposedBefore: [] });
    expect(a.disposed).toBe(true);
    expect(h.runner.status("a").status).toBe("off");
  });

  it("aborts a start no longer wanted and disposes it if it arrives late", async () => {
    const h = createHarness();
    const defs = [definition("a")];
    h.runner.update(defs, wanted("a"));
    const { signal } = h.context("a");

    h.runner.update(defs, wanted());
    const late = await h.resolve("a");

    expect(signal.aborted).toBe(true);
    expect(late.disposed).toBe(true);
    expect(h.handovers).toEqual([]);
    expect(h.runner.status("a").status).toBe("off");
  });

  it("swaps within a group atomically: the old one runs until the new one does", async () => {
    const h = createHarness();
    const defs = [
      definition("rnnoise", { exclusiveGroup: "noise-suppression" }),
      definition("krisp", { exclusiveGroup: "noise-suppression" }),
    ];
    h.runner.update(defs, wanted("rnnoise"));
    const rnnoise = await h.resolve("rnnoise");

    h.runner.update(defs, wanted("rnnoise", "krisp"));
    const whileStarting = h.runner.status("rnnoise").status;
    await h.resolve("krisp");

    expect(whileStarting).toBe("running");
    expect(h.handovers.map((x) => x.ids)).toEqual([["rnnoise"], ["krisp"]]);
    expect(h.handovers.at(-1)?.disposedBefore).toEqual([]);
    expect(rnnoise.disposed).toBe(true);
    expect(h.replaced).toEqual([["rnnoise"]]);
    expect(h.runner.status("rnnoise").status).toBe("off");
  });

  it("does not restart a replaced effect while it is still listed as wanted", async () => {
    const h = createHarness();
    const defs = [
      definition("rnnoise", { exclusiveGroup: "noise-suppression" }),
      definition("krisp", { exclusiveGroup: "noise-suppression" }),
    ];
    h.runner.update(defs, wanted("rnnoise"));
    await h.resolve("rnnoise");
    h.runner.update(defs, wanted("rnnoise", "krisp"));
    await h.resolve("krisp");

    h.runner.update(defs, wanted("rnnoise", "krisp"));
    const suppressed = h.pending.get("rnnoise")?.length ?? 0;
    h.runner.update(defs, wanted("krisp"));
    h.runner.update(defs, wanted("krisp", "rnnoise"));

    expect(suppressed).toBe(0);
    expect(h.runner.status("rnnoise").status).toBe("starting");
  });

  it("keeps the old effect of a group when the new one fails to start", async () => {
    const h = createHarness();
    const defs = [
      definition("rnnoise", { exclusiveGroup: "noise-suppression" }),
      definition("krisp", { exclusiveGroup: "noise-suppression" }),
    ];
    h.runner.update(defs, wanted("rnnoise"));
    const rnnoise = await h.resolve("rnnoise");

    h.runner.update(defs, wanted("rnnoise", "krisp"));
    const error = new DOMException("no Cloud", "NotSupportedError");
    await h.reject("krisp", error);

    expect(rnnoise.disposed).toBe(false);
    expect(h.runner.status("krisp")).toEqual({
      status: "failed",
      error: "NotSupportedError",
    });
    expect(h.replaced).toEqual([]);
    expect(h.errors).toEqual([error]);
  });

  it("retries a failed effect only once it was turned off and on again", async () => {
    const h = createHarness();
    const defs = [definition("a")];
    h.runner.update(defs, wanted("a"));
    await h.reject("a", new Error("boom"));

    h.runner.update(defs, wanted("a"));
    const stillFailed = h.runner.status("a").status;
    h.runner.update(defs, wanted());
    h.runner.update(defs, wanted("a"));

    expect(stillFailed).toBe("failed");
    expect(h.runner.status("a").status).toBe("starting");
  });

  it("takes an effect out when it fails while running", async () => {
    const h = createHarness();
    const defs = [definition("a"), definition("b")];
    h.runner.update(defs, wanted("a", "b"));
    const a = await h.resolve("a");
    await h.resolve("b");

    h.context("a").fail(new TypeError("worklet crashed"));

    expect(h.handovers.at(-1)?.ids).toEqual(["b"]);
    expect(a.disposed).toBe(true);
    expect(h.runner.status("a")).toEqual({
      status: "failed",
      error: "TypeError",
    });
  });

  it("ignores failures reported by instances that already left", async () => {
    const h = createHarness();
    const defs = [definition("a")];
    h.runner.update(defs, wanted("a"));
    await h.resolve("a");
    const { fail } = h.context("a");
    h.runner.update(defs, wanted());

    fail(new Error("late"));

    expect(h.runner.status("a").status).toBe("off");
    expect(h.errors).toEqual([]);
  });

  it("stops everything when its definitions go away, keeping no status", async () => {
    const h = createHarness();
    h.runner.update([definition("a")], wanted("a"));
    const a = await h.resolve("a");

    h.runner.update([], wanted("a"));

    expect(a.disposed).toBe(true);
    expect(h.handovers.at(-1)?.ids).toEqual([]);
    expect(h.runner.status("a").status).toBe("off");
  });

  it("disposes running and late instances once disposed itself", async () => {
    const h = createHarness();
    const defs = [definition("a"), definition("b")];
    h.runner.update(defs, wanted("a", "b"));
    const a = await h.resolve("a");

    h.runner.dispose();
    const b = await h.resolve("b");

    expect([a.disposed, b.disposed]).toEqual([true, true]);
    expect(h.handovers.at(-1)?.ids).toEqual([]);
  });

  it("fails an effect whose start throws at once", async () => {
    const errors: unknown[] = [];
    const runner = createEffectRunner<RunnableDefinition, Instance>({
      group: () => null,
      start: () => {
        throw new RangeError("bad options");
      },
      onRunning: vi.fn(),
      onStatus: vi.fn(),
      onReplaced: vi.fn(),
      onError: (error) => errors.push(error),
    });

    runner.update([definition("a")], wanted("a"));
    await Promise.resolve();
    await Promise.resolve();

    expect(runner.status("a")).toEqual({
      status: "failed",
      error: "RangeError",
    });
    expect(errors).toHaveLength(1);
  });

  it("reports an instance that throws while disposed, and goes on", async () => {
    const h = createHarness();
    h.runner.update([definition("a")], wanted("a"));
    const a = await h.resolve("a");
    const error = new Error("dispose failed");
    a.dispose = () => {
      throw error;
    };

    h.runner.update([definition("a")], wanted());

    expect(h.errors).toEqual([error]);
    expect(h.runner.status("a").status).toBe("off");
  });

  it("fails an effect whose hand-over throws, instead of leaving it half wired", async () => {
    const errors: unknown[] = [];
    let instance: Instance | null = null;
    const runner = createEffectRunner<RunnableDefinition, Instance>({
      group: () => null,
      start: () => {
        instance = {
          id: "a",
          disposed: false,
          dispose() {
            this.disposed = true;
          },
        };
        return Promise.resolve(instance);
      },
      onRunning: (running) => {
        if (running.length > 0)
          throw new DOMException("other context", "InvalidAccessError");
      },
      onStatus: vi.fn(),
      onReplaced: vi.fn(),
      onError: (error) => errors.push(error),
    });

    runner.update([definition("a")], wanted("a"));
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    expect(runner.status("a")).toEqual({
      status: "failed",
      error: "InvalidAccessError",
    });
    expect((instance as Instance | null)?.disposed).toBe(true);
  });

  it("reports a non-Error failure as Error", async () => {
    const h = createHarness();
    h.runner.update([definition("a")], wanted("a"));

    h.pending.get("a")?.[0]?.reject("nope" as unknown as Error);
    await h.settle();

    expect(h.runner.status("a")).toEqual({ status: "failed", error: "Error" });
  });
});
