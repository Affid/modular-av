import { createFakeAudioEffect } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALWAYS,
  captureOf,
  createTable,
  heard,
  micEnabled,
  type Tab,
} from "./table.ts";

const PTT = { voice: { ...ALWAYS.voice, mode: "ptt" } } as const;

const reverb = (tail: number) => ({
  ...createFakeAudioEffect("reverb", { defaultPlace: "send" }).definition,
  tail,
});

/** A player with a running effect that rings for `tail` seconds. */
async function ringing(tail: number, av: typeof ALWAYS | typeof PTT = ALWAYS) {
  const table = createTable();
  const gm = table.join("gm", { secret: true, av: ALWAYS });
  const p1 = table.join("p1", { av, effects: [reverb(tail)] });
  await table.settle();
  await p1.api.commands.setEffectEnabled("reverb", true);
  await table.settle();
  return { table, gm, p1 };
}

const muteLevel = (tab: Tab): number | undefined =>
  captureOf(tab).level("mute")?.level;

const serviceMuted = (
  table: ReturnType<typeof createTable>,
  tab: Tab,
): boolean => table.hub.isMuted(tab.client.game.userId, "microphone");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the tail after mute", () => {
  it("holds nothing for a tail ahead of Mute: it can't ring out", async () => {
    // Arrange
    const { table, p1 } = await ringing(2);
    await p1.api.commands.setAudioEffectPlace("reverb", "pre-gate");
    await table.settle();

    // Act
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Assert
    expect(serviceMuted(table, p1)).toBe(true);
  });

  it("stops what goes in at once, and holds the output for the tail", async () => {
    // Arrange
    const { table, p1 } = await ringing(2);

    // Act
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Assert
    expect(muteLevel(p1)).toBe(0);
    expect(micEnabled(p1)).toBe(true);
    expect(serviceMuted(table, p1)).toBe(false);
    expect(p1.api.state.get().local.muted).toBe(true);
    expect(p1.api.state.get().local.broadcasting).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
    await table.settle();

    expect(micEnabled(p1)).toBe(false);
    expect(serviceMuted(table, p1)).toBe(true);
  });

  it("closes at once with no tail to wait for", async () => {
    const table = createTable();
    table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    await p1.api.commands.setMuted(true);

    expect(micEnabled(p1)).toBe(false);
  });

  it("holds for 3 s at most, whatever an effect declares", async () => {
    const { table, p1 } = await ringing(60);

    await p1.api.commands.setMuted(true);
    await vi.advanceTimersByTimeAsync(2900);
    const during = micEnabled(p1);
    await vi.advanceTimersByTimeAsync(200);
    await table.settle();

    expect(during).toBe(true);
    expect(micEnabled(p1)).toBe(false);
  });

  it("carries on when the player unmutes during the tail", async () => {
    const { table, p1 } = await ringing(2);

    await p1.api.commands.setMuted(true);
    await vi.advanceTimersByTimeAsync(500);
    await p1.api.commands.setMuted(false);
    await vi.advanceTimersByTimeAsync(3000);
    await table.settle();

    expect(muteLevel(p1)).toBe(1);
    expect(micEnabled(p1)).toBe(true);
  });

  it("holds on deafen too", async () => {
    const { table, p1 } = await ringing(2);

    await p1.core.controller().setDeafened(true);
    await table.settle();
    const during = micEnabled(p1);
    await vi.advanceTimersByTimeAsync(2000);
    await table.settle();

    expect(muteLevel(p1)).toBe(0);
    expect(during).toBe(true);
    expect(micEnabled(p1)).toBe(false);
  });

  it("holds on push to talk release", async () => {
    // Arrange
    const { table, p1 } = await ringing(1, PTT);
    p1.core.controller().setBroadcastIntent(true);
    await table.settle();
    expect(muteLevel(p1)).toBe(1);

    // Act
    p1.core.controller().setBroadcastIntent(false);
    await table.settle();
    const during = { open: micEnabled(p1), input: muteLevel(p1) };
    await vi.advanceTimersByTimeAsync(1000);
    await table.settle();

    // Assert
    expect(during).toEqual({ open: true, input: 0 });
    expect(micEnabled(p1)).toBe(false);
  });

  it("cuts at once when the player chose that", async () => {
    const { table, p1 } = await ringing(2);
    await p1.api.commands.setCutTails(true);
    await table.settle();

    await p1.api.commands.setMuted(true);

    expect(p1.api.state.get().local.cutTails).toBe(true);
    expect(micEnabled(p1)).toBe(false);
  });

  it("never holds through a GM's block, even mid tail", async () => {
    // Arrange
    const { table, gm, p1 } = await ringing(2);

    // Act: a block on its own, then one during a tail.
    await gm.api.commands.setBroadcastPermissions("p1", { audio: false });
    await table.settle();

    // Assert
    expect(micEnabled(p1)).toBe(false);
    expect(heard(gm, p1)).toBeNull();

    await gm.api.commands.setBroadcastPermissions("p1", { audio: true });
    await table.settle();
    await p1.api.commands.setMuted(true);
    expect(micEnabled(p1)).toBe(true);
    await gm.api.commands.setBroadcastPermissions("p1", { audio: false });

    expect(micEnabled(p1)).toBe(false);
  });
});

describe("hearing a tail", () => {
  it("reaches the others: playback doesn't act on a sender's mute", async () => {
    const { table, gm, p1 } = await ringing(2);

    await p1.api.commands.setMuted(true);
    await table.settle();

    expect(heard(gm, p1)).not.toBeNull();
  });
});
