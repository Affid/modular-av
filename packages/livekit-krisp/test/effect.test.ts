import { describe, expect, it } from "vitest";
import { RETRY_WINDOW_MS, startKrisp, type KrispDeps } from "../src/effect.ts";
import {
  effectContext,
  fakeBridge,
  fakeKrisp,
  type FakeKrispOptions,
  type FakeProcessor,
  fakeRoom,
  ticks,
} from "./fakes.ts";

const ROOM = { name: "room" };

function setup(options: FakeKrispOptions & { room?: object | null } = {}) {
  const krisp = fakeKrisp(options);
  const room = fakeRoom(options.room === undefined ? ROOM : options.room);
  const bridges: ReturnType<typeof fakeBridge>[] = [];
  const errors: unknown[] = [];
  const clock = { now: 0 };
  const deps: KrispDeps = {
    load: () => Promise.resolve(krisp.module),
    room,
    quality: () => "high",
    now: () => clock.now,
    onError: (error) => errors.push(error),
    createBridge: () => {
      const bridge = fakeBridge();
      bridges.push(bridge);
      return bridge;
    },
  };
  return { krisp, room, bridges, deps, errors, clock };
}

describe("Krisp in the microphone chain", () => {
  it("runs between the bridge's nodes once LiveKit's room let it turn on", async () => {
    // Arrange
    const s = setup();
    const { context } = effectContext();

    // Act
    const effect = await startKrisp(s.deps, context);

    // Assert
    const processor = s.krisp.processors[0];
    const bridge = s.bridges[0];
    expect(processor?.inits).toEqual([
      {
        kind: "audio",
        track: bridge?.track,
        audioContext: context.audioContext,
      },
    ]);
    expect(processor?.published).toEqual([ROOM]);
    expect(processor?.isEnabled()).toBe(true);
    expect(bridge?.attached).toEqual([processor?.processedTrack]);
    expect(effect.input).toBe(bridge?.input);
    expect(effect.output).toBe(bridge?.output);
    expect(s.krisp.qualities).toEqual(["high"]);
  });

  it("waits for the call's room", async () => {
    const s = setup({ room: null });
    const { context } = effectContext();
    let started = false;

    const starting = startKrisp(s.deps, context).then(() => {
      started = true;
    });
    await ticks();
    const before = started;
    s.room.set(ROOM);
    await starting;

    expect(before).toBe(false);
    expect(s.krisp.processors[0]?.published).toEqual([ROOM]);
  });

  it("fails when the LiveKit project doesn't allow Krisp, and frees it", async () => {
    const s = setup({ allowed: false });

    await expect(
      startKrisp(s.deps, effectContext().context),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(s.krisp.processors[0]?.destroyed).toBe(true);
    expect(s.bridges[0]?.disposed).toBe(true);
  });

  it("fails before making anything where Krisp can't run", async () => {
    const s = setup({ supported: false });

    await expect(
      startKrisp(s.deps, effectContext().context),
    ).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(s.krisp.processors).toHaveLength(0);
    expect(s.bridges).toHaveLength(0);
  });

  it("stops waiting for a room when turned off, and frees it", async () => {
    const s = setup({ room: null });
    const { context, controller } = effectContext();

    const starting = startKrisp(s.deps, context);
    await ticks();
    controller.abort();

    await expect(starting).rejects.toMatchObject({ name: "AbortError" });
    expect(s.krisp.processors[0]?.destroyed).toBe(true);
  });

  it("tells Krisp about the room of each reconnect", async () => {
    const s = setup();
    await startKrisp(s.deps, effectContext().context);
    const next = { name: "after a reconnect" };

    s.room.set(null);
    s.room.set(next);

    expect(s.krisp.processors[0]?.published).toEqual([ROOM, next]);
  });

  it("turns Krisp back on when it turned itself off", async () => {
    const s = setup();
    const { context, fail } = effectContext();
    await startKrisp(s.deps, context);

    s.krisp.processors[0]?.turnOff();
    await ticks();

    expect(s.krisp.processors[0]?.isEnabled()).toBe(true);
    expect(fail).not.toHaveBeenCalled();
  });

  it("gives up when Krisp turns itself off again within a minute", async () => {
    const s = setup();
    const { context, fail } = effectContext();
    await startKrisp(s.deps, context);
    s.krisp.processors[0]?.turnOff();
    await ticks();

    s.clock.now = RETRY_WINDOW_MS - 1;
    s.krisp.processors[0]?.turnOff();
    await ticks();

    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ name: "NotAllowedError" }),
    );
  });

  it("turns it back on again a minute later", async () => {
    const s = setup();
    const { context, fail } = effectContext();
    await startKrisp(s.deps, context);
    s.krisp.processors[0]?.turnOff();
    await ticks();

    s.clock.now = RETRY_WINDOW_MS;
    s.krisp.processors[0]?.turnOff();
    await ticks();

    expect(s.krisp.processors[0]?.isEnabled()).toBe(true);
    expect(fail).not.toHaveBeenCalled();
  });

  it("tells Krisp of a room that came while it turned on", async () => {
    const s = setup();
    const next = { name: "reconnected meanwhile" };
    const processor = (): FakeProcessor | undefined => s.krisp.processors[0];
    const starting = startKrisp(s.deps, effectContext().context);
    await ticks(2);
    s.room.set(next);

    await starting;

    expect(processor()?.published.at(-1)).toBe(next);
  });

  it("reports a teardown that failed", async () => {
    const s = setup();
    const effect = await startKrisp(s.deps, effectContext().context);
    const broken = new Error("Krisp couldn't stop");
    const processor = s.krisp.processors[0];
    if (processor) processor.destroy = () => Promise.reject(broken);

    effect.dispose();
    await ticks();

    expect(s.errors).toContain(broken);
  });

  it("gives up when Krisp won't come back on", async () => {
    let allowed = true;
    const s = setup({ allowed: () => allowed });
    const { context, fail } = effectContext();
    await startKrisp(s.deps, context);

    allowed = false;
    s.krisp.processors[0]?.turnOff();
    await ticks();

    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ name: "NotAllowedError" }),
    );
  });

  it("stops listening and frees Krisp when disposed", async () => {
    const s = setup();
    const effect = await startKrisp(s.deps, effectContext().context);

    effect.dispose();
    s.room.set({ name: "later" });

    expect(s.krisp.processors[0]?.destroyed).toBe(true);
    expect(s.bridges[0]?.disposed).toBe(true);
    expect(s.krisp.processors[0]?.published).toEqual([ROOM]);
  });
});
