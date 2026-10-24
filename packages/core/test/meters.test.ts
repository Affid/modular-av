import type { MeterReading } from "@modular-av/api";
import { createFakeVideoElement } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METER_INTERVAL_MS } from "../src/media/meters.ts";
import { ALWAYS, captureOf, createTable, micOf } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const OFF_SCREEN = { visible: false, height: 20 };
const ON_SCREEN = { visible: true, height: 20 };

async function call() {
  const table = createTable();
  const gm = table.join("gm", { secret: true, av: ALWAYS });
  const p1 = table.join("p1", { av: ALWAYS });
  await table.settle();
  return { table, gm, p1 };
}

describe("the local player's meter", () => {
  it("reports the gate's level, threshold and state only while shown", async () => {
    // Arrange
    const { p1 } = await call();
    const gate = captureOf(p1).gates[0];
    const element = createFakeVideoElement();
    const readings: MeterReading[] = [];

    // Act
    const off = p1.api.meters.subscribe("p1", element, (r) => readings.push(r));
    gate?.emit(true);
    gate?.emitLevel(-30, -50);

    // Assert
    expect(gate?.levels).toBe(true);
    expect(readings).toEqual([{ db: -30, threshold: -50, open: true }]);
    p1.env.setOnScreen(element, OFF_SCREEN);
    expect(gate?.levels).toBe(false);
    gate?.emitLevel(-31, -50);
    expect(readings).toHaveLength(1);
    p1.env.setOnScreen(element, ON_SCREEN);
    expect(gate?.levels).toBe(true);
    off();
    expect(gate?.levels).toBe(false);
  });

  it("stops by itself when its element leaves the page", async () => {
    const { p1 } = await call();
    const gate = captureOf(p1).gates[0];
    const element = createFakeVideoElement();
    p1.api.meters.subscribe("p1", element, () => undefined);

    p1.env.removeElement(element);

    expect(gate?.levels).toBe(false);
  });

  it("starts once the microphone comes, if subscribed before", async () => {
    const table = createTable();
    const readings: MeterReading[] = [];
    const p1 = table.join("p1", {
      av: ALWAYS,
      register(api) {
        api.meters.subscribe("p1", createFakeVideoElement(), (r) =>
          readings.push(r),
        );
      },
    });
    await table.settle();

    captureOf(p1).gates[0]?.emitLevel(-40, -50);

    expect(readings.map((r) => r.db)).toEqual([-40]);
  });
});

describe("another player's meter", () => {
  it("samples what this client plays of them, only while shown", async () => {
    // Arrange
    const { gm, p1 } = await call();
    const element = createFakeVideoElement();
    const readings: MeterReading[] = [];

    // Act
    gm.api.meters.subscribe("p1", element, (r) => readings.push(r));
    await vi.advanceTimersByTimeAsync(0);
    gm.env.setLevel(micOf(p1), -20);
    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS * 2);

    // Assert
    expect(readings).toEqual([
      { db: -20, threshold: null, open: null },
      { db: -20, threshold: null, open: null },
    ]);
    expect(gm.env.levelMeters.filter((m) => !m.disposed)).toHaveLength(1);
    gm.env.setOnScreen(element, OFF_SCREEN);
    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS * 4);
    expect(readings).toHaveLength(2);
    expect(gm.env.levelMeters.every((m) => m.disposed)).toBe(true);
  });

  it("measures nobody this client may not hear", async () => {
    const { gm } = await call();
    const readings: MeterReading[] = [];
    gm.api.meters.subscribe("p1", createFakeVideoElement(), (r) =>
      readings.push(r),
    );
    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS);

    await gm.api.commands.setHiddenByMe("p1", true);
    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS * 4);
    const after = readings.length;
    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS * 4);

    expect(readings.length).toBe(after);
    expect(gm.env.levelMeters.every((m) => m.disposed)).toBe(true);
  });

  it("keeps sampling for others when the element it ran in goes", async () => {
    const { gm, p1 } = await call();
    const first = createFakeVideoElement();
    const readings: MeterReading[] = [];
    const offFirst = gm.api.meters.subscribe("p1", first, () => undefined);
    gm.api.meters.subscribe("p1", createFakeVideoElement(), (r) =>
      readings.push(r),
    );
    gm.env.setLevel(micOf(p1), -30);
    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS);
    const before = readings.length;

    offFirst();
    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS * 3);

    expect(before).toBeGreaterThan(0);
    expect(readings.length).toBeGreaterThanOrEqual(before + 2);
  });

  it("keeps a listener's error from stopping the others", async () => {
    const { gm } = await call();
    const readings: MeterReading[] = [];
    gm.api.meters.subscribe("p1", createFakeVideoElement(), () => {
      throw new Error("listener broke");
    });
    gm.api.meters.subscribe("p1", createFakeVideoElement(), (r) =>
      readings.push(r),
    );

    await vi.advanceTimersByTimeAsync(METER_INTERVAL_MS);

    expect(readings).toHaveLength(1);
    expect(gm.errors.length).toBeGreaterThan(0);
  });
});
