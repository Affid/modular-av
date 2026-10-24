import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALWAYS,
  captureOf,
  createTable,
  heard,
  master,
  micEnabled,
  micOf,
  type Tab,
} from "./table.ts";

const ACTIVITY = { voice: { ...ALWAYS.voice, mode: "activity" } } as const;
const PTT = { voice: { ...ALWAYS.voice, mode: "ptt" } } as const;

const gateOf = (tab: Tab) => {
  const gate = captureOf(tab).gates.at(-1);
  if (!gate) throw new Error("no gate");
  return gate;
};

/** What Foundry shows and tells the others about the local player. */
const speaking = (tab: Tab): boolean | undefined =>
  master(tab).settings.activity[tab.client.game.userId]?.speaking;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the voice gate", () => {
  it("sends the capture context's output and gives Foundry no levels stream", async () => {
    // Arrange
    const table = createTable();
    const gm = table.join("gm", { secret: true });

    // Act
    const p1 = table.join("p1", { av: ACTIVITY });
    await table.settle();

    // Assert
    expect(micOf(p1)).toBe(captureOf(p1).output);
    expect(heard(gm, p1)).toBe(captureOf(p1).output);
    expect(master(p1).detectionStream).toBeNull();
  });

  it("gates in voice activity mode, and only detects in the others", async () => {
    const table = createTable();
    const activity = table.join("p1", { av: ACTIVITY });
    const always = table.join("gm", { secret: true, av: ALWAYS });
    const ptt = table.join("gm2", { av: PTT });
    await table.settle();

    expect(gateOf(activity).configs.at(-1)?.mode).toBe("gate");
    expect(gateOf(always).configs.at(-1)?.mode).toBe("detect");
    expect(gateOf(ptt).configs.at(-1)?.mode).toBe("detect");
  });

  it("follows a change of voice mode", async () => {
    const table = createTable();
    const p1 = table.join("p1", { av: PTT });
    await table.settle();

    master(p1).settings.set("client", "voice.mode", "activity");
    await table.settle();

    expect(gateOf(p1).configs.at(-1)?.mode).toBe("gate");
  });

  it("owns voice activity: the track stays on, the gate drives speaking", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ACTIVITY });
    await table.settle();
    const silent = {
      speaking: speaking(p1),
      broadcasting: p1.api.state.get().local.broadcasting,
    };

    // Act
    gateOf(p1).emit(true);
    await table.settle();
    const open = {
      speaking: speaking(p1),
      broadcasting: p1.api.state.get().local.broadcasting,
    };
    gateOf(p1).emit(false);
    await table.settle();

    // Assert
    expect(silent).toEqual({ speaking: false, broadcasting: false });
    expect(open).toEqual({ speaking: true, broadcasting: true });
    expect(speaking(p1)).toBe(false);
    // The gate silences the audio itself: no mute signalling per pause.
    expect(micEnabled(p1)).toBe(true);
    expect(table.hub.isMuted("p1", "microphone")).toBe(false);
  });

  it("shows real speech in always mode instead of Foundry's constant intent", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const atStart = speaking(p1);

    gateOf(p1).emit(true);
    await table.settle();

    expect(atStart).toBe(false);
    expect(speaking(p1)).toBe(true);
    expect(micEnabled(p1)).toBe(true);
  });

  it("tells Foundry what the gate hears when it starts or stops driving", async () => {
    // Arrange: speech already going on in push to talk mode.
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: PTT });
    await table.settle();
    gateOf(p1).emit(true);
    await table.settle();

    // Act
    master(p1).settings.set("client", "voice.mode", "activity");
    await table.settle();
    const inActivity = speaking(p1);
    master(p1).settings.set("client", "voice.mode", "ptt");
    await table.settle();
    const inPtt = { speaking: speaking(p1), sending: micEnabled(p1) };
    master(p1).settings.set("client", "voice.mode", "always");
    await table.settle();

    // Assert: back in push to talk, the key decides again.
    expect(inActivity).toBe(true);
    expect(inPtt).toEqual({ speaking: false, sending: false });
    expect(speaking(p1)).toBe(true);
  });

  it("keeps push to talk to Foundry's key in ptt mode", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: PTT });
    await table.settle();

    gateOf(p1).emit(true);
    await table.settle();
    const byGate = micEnabled(p1);
    master(p1)._onPTTStart();
    await table.settle();

    expect(byGate).toBe(false);
    expect(micEnabled(p1)).toBe(true);
    expect(speaking(p1)).toBe(true);
  });

  it("keeps a muted player silent and not speaking while the gate opens", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ACTIVITY });
    await p1.api.commands.setMuted(true);
    await table.settle();

    gateOf(p1).emit(true);
    await table.settle();

    expect(micEnabled(p1)).toBe(false);
    expect(speaking(p1)).toBe(false);
    expect(p1.api.state.get().local.broadcasting).toBe(false);
  });
});

describe("an open mic", () => {
  it("sends everything, plainly, when the gate can't run in voice activity mode", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ACTIVITY });
    await table.settle();

    // Act
    gateOf(p1).fail(new Error("processorerror"));
    await table.settle();

    // Assert
    expect(p1.api.state.get().local.openMic).toBe(true);
    expect(p1.api.state.get().local.broadcasting).toBe(true);
    expect(micEnabled(p1)).toBe(true);
    expect(p1.client.notifications.map((n) => n.message)).toContain(
      "Voice and video: voice activity can't run, so your microphone is always on. Mute yourself or use push to talk.",
    );
  });

  it("is not an open mic in the other modes or while muted", async () => {
    const table = createTable();
    const always = table.join("gm", { secret: true, av: ALWAYS });
    const muted = table.join("p1", { av: ACTIVITY });
    await muted.api.commands.setMuted(true);
    await table.settle();

    gateOf(always).fail(new Error("processorerror"));
    gateOf(muted).fail(new Error("processorerror"));
    await table.settle();

    expect(always.api.state.get().local.openMic).toBe(false);
    expect(muted.api.state.get().local.openMic).toBe(false);
  });
});

describe("speaking while muted", () => {
  const MUTED_HINT =
    "Voice and video: you're muted, so the others can't hear you.";
  const hints = (tab: Tab): number =>
    tab.client.notifications.filter((n) => n.message === MUTED_HINT).length;

  it("tells a muted player who keeps talking, and clears when they stop", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: PTT });
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Act
    gateOf(p1).emit(true);
    await vi.advanceTimersByTimeAsync(800);
    await table.settle();
    const talking = p1.api.state.get().local.speakingWhileMuted;
    gateOf(p1).emit(false);
    await table.settle();

    // Assert
    expect(talking).toBe(true);
    expect(p1.api.state.get().local.speakingWhileMuted).toBe(false);
    expect(hints(p1)).toBe(1);
  });

  it("ignores a short sound, like a cough", async () => {
    const table = createTable();
    const p1 = table.join("p1", { av: ACTIVITY });
    await p1.api.commands.setMuted(true);
    await table.settle();

    gateOf(p1).emit(true);
    await vi.advanceTimersByTimeAsync(300);
    gateOf(p1).emit(false);
    await vi.advanceTimersByTimeAsync(1000);
    await table.settle();

    expect(p1.api.state.get().local.speakingWhileMuted).toBe(false);
    expect(hints(p1)).toBe(0);
  });

  it("counts deafened as muted, and never an unmuted player", async () => {
    const table = createTable();
    const deafened = table.join("p1", { av: ALWAYS });
    const unmuted = table.join("gm", { secret: true, av: ALWAYS });
    await deafened.api.commands.setDeafened(true);
    await table.settle();

    for (const tab of [deafened, unmuted]) gateOf(tab).emit(true);
    await vi.advanceTimersByTimeAsync(800);
    await table.settle();

    expect(deafened.api.state.get().local.speakingWhileMuted).toBe(true);
    expect(unmuted.api.state.get().local.speakingWhileMuted).toBe(false);
  });

  it("shows at once when a player mutes in the middle of talking, and clears on unmute", async () => {
    const table = createTable();
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    gateOf(p1).emit(true);
    await vi.advanceTimersByTimeAsync(800);

    await p1.api.commands.setMuted(true);
    await table.settle();
    const muted = p1.api.state.get().local.speakingWhileMuted;
    await p1.api.commands.setMuted(false);
    await table.settle();

    expect(muted).toBe(true);
    expect(p1.api.state.get().local.speakingWhileMuted).toBe(false);
  });

  it("repeats the hint at most every 30 seconds", async () => {
    const table = createTable();
    const p1 = table.join("p1", { av: PTT });
    await p1.api.commands.setMuted(true);
    await table.settle();
    const talk = async (): Promise<void> => {
      gateOf(p1).emit(true);
      await vi.advanceTimersByTimeAsync(800);
      gateOf(p1).emit(false);
      await table.settle();
    };

    await talk();
    await vi.advanceTimersByTimeAsync(5_000);
    await talk();
    const soon = hints(p1);
    await vi.advanceTimersByTimeAsync(30_000);
    await talk();

    expect(soon).toBe(1);
    expect(hints(p1)).toBe(2);
  });
});
