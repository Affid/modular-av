import type { AudioSource } from "@modular-av/api";
import {
  createFakeTrack,
  endFakeTrack,
  fakeTrackInfo,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALWAYS,
  createTable,
  heard,
  micOf,
  type Tab,
  type TabOptions,
} from "./table.ts";

const MODULE = "transcriber";
const PTT = { voice: { ...ALWAYS.voice, mode: "ptt" } } as const;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function tableWithModules() {
  return createTable({
    modules: [
      { id: "modular-av", version: "0.1.0" },
      { id: MODULE, version: "1.0.0" },
      { id: "switched-off", version: "1.0.0", active: false },
    ],
  });
}

async function call(p1Options: TabOptions = {}) {
  const table = tableWithModules();
  const gm = table.join("gm", { secret: true, av: ALWAYS });
  const p1 = table.join("p1", { av: ALWAYS, ...p1Options });
  await table.settle();
  return { table, gm, p1 };
}

/** What `tab`'s listener received for `participant`'s `source`, in order. */
function listen(
  tab: Tab,
  participant: string,
  source: AudioSource = "microphone",
) {
  const received: (MediaStreamTrack | null)[] = [];
  const off = tab.api.media.audio(MODULE, participant, source, (track) => {
    received.push(track);
  });
  return { received, off };
}

const original = (track: MediaStreamTrack | null | undefined) =>
  track ? fakeTrackInfo(track).cloneOf : undefined;

const stopped = (track: MediaStreamTrack | null | undefined) =>
  track ? fakeTrackInfo(track).readyState === "ended" : undefined;

describe("another player's sound", () => {
  it("hands a copy of what this client plays of them", async () => {
    // Arrange
    const { table, gm, p1 } = await call();

    // Act
    const { received } = listen(gm, "p1");
    await table.settle();

    // Assert
    expect(received).toHaveLength(1);
    expect(received[0]).not.toBe(micOf(p1));
    expect(original(received[0])).toBe(micOf(p1));
  });

  it("keeps playback going when a consumer stops or disables its copy", async () => {
    const { table, gm, p1 } = await call();
    const { received } = listen(gm, "p1");
    await table.settle();

    const copy = received[0];
    if (copy) copy.enabled = false;
    copy?.stop();

    const played = heard(gm, p1);
    expect(played).toBe(micOf(p1));
    expect(played && fakeTrackInfo(played)).toMatchObject({
      enabled: true,
      readyState: "live",
    });
  });

  it("gives null and stops the copy while this client may not hear them", async () => {
    // Arrange
    const { table, gm, p1 } = await call();
    const { received } = listen(gm, "p1");
    await table.settle();

    // Act
    await gm.api.commands.setHiddenByMe("p1", true);
    await table.settle();

    // Assert
    expect(received).toHaveLength(2);
    expect(received[1]).toBeNull();
    expect(stopped(received[0])).toBe(true);
    await gm.api.commands.setHiddenByMe("p1", false);
    await table.settle();
    expect(received).toHaveLength(3);
    expect(original(received[2])).toBe(micOf(p1));
  });

  it("keeps the copy while they mute themselves: their track stays, silent", async () => {
    // Arrange
    const { table, gm, p1 } = await call();
    const { received } = listen(gm, "p1");
    await table.settle();

    // Act
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Assert
    expect(received).toHaveLength(1);
    expect(stopped(received[0])).toBe(false);
  });

  it("gives null while this client is deafened", async () => {
    const { table, gm } = await call();
    const { received } = listen(gm, "p1");
    await table.settle();

    await gm.api.commands.setDeafened(true);
    await table.settle();

    expect(received.at(-1)).toBeNull();
    expect(stopped(received[0])).toBe(true);
  });

  it("hands a new copy when the service replaces their track", async () => {
    // Arrange
    const { table, gm } = await call();
    const { received } = listen(gm, "p1");
    await table.settle();
    const replacement = createFakeTrack("audio");

    // Act
    gm.core.controller().remote.add({
      participant: "p1",
      source: "microphone",
      track: replacement,
    });

    // Assert
    expect(received).toHaveLength(2);
    expect(original(received[1])).toBe(replacement);
    expect(stopped(received[0])).toBe(true);
  });

  it("hands nothing for a track that already ended", async () => {
    const { table, gm } = await call();
    const { received } = listen(gm, "p1");
    await table.settle();
    const gone = createFakeTrack("audio");
    endFakeTrack(gone);

    gm.core.controller().remote.add({
      participant: "p1",
      source: "microphone",
      track: gone,
    });

    expect(received).toHaveLength(2);
    expect(received[1]).toBeNull();
  });

  it("hands the shared screen's sound for the screen source", async () => {
    const { table, gm, p1 } = await call();
    const { received } = listen(gm, "p1", "screen");
    await table.settle();
    expect(received).toEqual([]);

    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();

    const sound = p1.env.displayCaptures[0]?.audio;
    expect(sound).toBeTruthy();
    expect(received).toHaveLength(1);
    expect(original(received[0])).toBe(sound);
  });
});

describe("the local player's sound", () => {
  it("hands a copy of what they send, and null while muted", async () => {
    // Arrange
    const { table, p1 } = await call();
    const { received } = listen(p1, "p1");
    await table.settle();
    expect(original(received[0])).toBe(micOf(p1));

    // Act
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Assert
    expect(received).toHaveLength(2);
    expect(received[1]).toBeNull();
    expect(stopped(received[0])).toBe(true);
    await p1.api.commands.setMuted(false);
    await table.settle();
    expect(original(received[2])).toBe(micOf(p1));
  });

  it("stays null through a voice test while muted", async () => {
    // Arrange
    const { table, p1 } = await call();
    const { received } = listen(p1, "p1");
    await table.settle();
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Act
    const [test] = p1.api.preview.voice()?.getAudioTracks() ?? [];
    await table.settle();

    // Assert
    expect(test).toBeDefined();
    expect(received).toHaveLength(2);
    expect(received[1]).toBeNull();
  });

  it("is null while push to talk is released, voice test or not", async () => {
    // Arrange
    const { table, p1 } = await call({ av: PTT });
    const { received } = listen(p1, "p1");
    await table.settle();
    expect(received).toEqual([]);

    // Act
    p1.api.preview.voice();
    await table.settle();
    const duringTest = [...received];
    p1.core.controller().setBroadcastIntent(true);
    await table.settle();

    // Assert
    expect(duringTest).toEqual([]);
    expect(original(received[0])).toBe(micOf(p1));
  });

  it("gives null once their microphone is gone", async () => {
    // Arrange
    const { table, p1 } = await call();
    const { received } = listen(p1, "p1");
    await table.settle();
    const raw = p1.env.captureContexts[0]?.sources[0]?.track;

    // Act
    p1.env.setUnplugged("audio", "default", true);
    if (raw) endFakeTrack(raw);
    await table.settle();

    // Assert
    expect(raw).toBeDefined();
    expect(received.at(-1)).toBeNull();
    expect(stopped(received[0])).toBe(true);
  });

  it("hands their own shared screen's sound", async () => {
    const { table, p1 } = await call();
    const { received } = listen(p1, "p1", "screen");

    await p1.api.commands.startScreenShare({ audio: true });
    await table.settle();

    expect(original(received[0])).toBe(p1.env.displayCaptures[0]?.audio);
  });
});

describe("a subscription", () => {
  it("waits for the call when made before it", async () => {
    const received: (MediaStreamTrack | null)[] = [];
    const table = tableWithModules();
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    table.join("p1", {
      av: ALWAYS,
      register(api) {
        api.media.audio(MODULE, "gm", "microphone", (t) => received.push(t));
      },
    });
    await table.settle();

    expect(received).toHaveLength(1);
    expect(original(received[0])).toBe(micOf(gm));
  });

  it("stops its copy and calls no more once ended", async () => {
    // Arrange
    const { table, gm } = await call();
    const { received, off } = listen(gm, "p1");
    await table.settle();

    // Act
    off();
    await gm.api.commands.setHiddenByMe("p1", true);
    await table.settle();

    // Assert
    expect(received).toHaveLength(1);
    expect(stopped(received[0])).toBe(true);
  });

  it("lets a listener end its own subscription when called", async () => {
    // Arrange
    const { table, gm } = await call();
    const received: (MediaStreamTrack | null)[] = [];
    const off = gm.api.media.audio(MODULE, "p1", "microphone", (track) => {
      received.push(track);
      off();
    });

    // Act
    await table.settle();
    await gm.api.commands.setHiddenByMe("p1", true);
    await table.settle();
    off();

    // Assert
    expect(received).toHaveLength(1);
    expect(stopped(received[0])).toBe(true);
  });

  it("lets a listener subscribe another when called", async () => {
    const { table, gm, p1 } = await call();
    const second: (MediaStreamTrack | null)[] = [];
    gm.api.media.audio(MODULE, "p1", "microphone", () => {
      if (second.length === 0)
        gm.api.media.audio(MODULE, "p1", "microphone", (t) => second.push(t));
    });

    await table.settle();

    expect(second).toHaveLength(1);
    expect(original(second[0])).toBe(micOf(p1));
  });

  it("calls nothing when ended before the call", async () => {
    const received: (MediaStreamTrack | null)[] = [];
    const table = tableWithModules();
    table.join("gm", { secret: true, av: ALWAYS });
    table.join("p1", {
      av: ALWAYS,
      register(api) {
        api.media.audio(MODULE, "gm", "microphone", (t) => received.push(t))();
      },
    });

    await table.settle();

    expect(received).toEqual([]);
  });

  it("gives each subscriber a copy of its own", async () => {
    const { table, gm } = await call();
    const first = listen(gm, "p1");
    const second = listen(gm, "p1");
    await table.settle();

    first.off();

    expect(first.received[0]).not.toBe(second.received[0]);
    expect(stopped(second.received[0])).toBe(false);
  });

  it("keeps a listener's error from stopping the others", async () => {
    const { table, gm } = await call();
    gm.api.media.audio(MODULE, "p1", "microphone", () => {
      throw new Error("listener broke");
    });
    const { received } = listen(gm, "p1");

    await table.settle();

    expect(received).toHaveLength(1);
    expect(gm.errors).toHaveLength(1);
  });

  it("is refused to a module that isn't active, and for an unknown source", async () => {
    const { gm } = await call();
    const subscribe = (moduleId: string, source: string) => () =>
      gm.api.media.audio(
        moduleId,
        "p1",
        source as AudioSource,
        () => undefined,
      );

    expect(subscribe("switched-off", "microphone")).toThrow(/switched-off/);
    expect(subscribe("nobody", "microphone")).toThrow(/nobody/);
    expect(subscribe(MODULE, "camera")).toThrow(/camera/);
    expect(() =>
      gm.api.media.audio(MODULE, "p1", "microphone", null as never),
    ).toThrow(TypeError);
  });
});
