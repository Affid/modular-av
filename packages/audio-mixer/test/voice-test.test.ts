import { describe, expect, it, vi } from "vitest";
import {
  createVoiceTest,
  RECORD_MS,
  type Recording,
  type VoiceTestStep,
} from "../src/window/voice-test.ts";

const stream = () => {
  const track = { stop: vi.fn() };
  return {
    track,
    stream: { getTracks: () => [track] } as unknown as MediaStream,
  };
};

function setup(recording: Partial<Recording> = {}) {
  const steps: VoiceTestStep[] = [];
  const sound = new Blob(["sound"]);
  const record = vi.fn(() => Promise.resolve(sound));
  const play = vi.fn(() => Promise.resolve());
  return {
    steps,
    sound,
    record,
    play,
    recording: { record, play, ...recording },
  };
}

describe("Test my voice", () => {
  it("records what is sent, stops the copy, then plays it back", async () => {
    // Arrange
    const { steps, sound, record, play, recording } = setup();
    const { stream: voice, track } = stream();
    const test = createVoiceTest(
      () => voice,
      recording,
      (s) => steps.push(s),
    );

    // Act
    await test.start();

    // Assert
    expect(record).toHaveBeenCalledWith(
      voice,
      RECORD_MS,
      expect.any(AbortSignal),
    );
    expect(play).toHaveBeenCalledWith(sound, expect.any(AbortSignal));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(steps).toEqual(["recording", "playing", "idle"]);
  });

  it("says it needs a microphone", async () => {
    const { steps, record, recording } = setup();
    const test = createVoiceTest(
      () => null,
      recording,
      (s) => steps.push(s),
    );

    await test.start();

    expect(steps).toEqual(["no-microphone"]);
    expect(record).not.toHaveBeenCalled();
  });

  it("stops the copy and says so when recording fails", async () => {
    // Arrange
    const boom = new Error("boom");
    const { steps, recording } = setup({
      record: () => Promise.reject(boom),
    });
    const { stream: voice, track } = stream();
    const test = createVoiceTest(
      () => voice,
      recording,
      (s) => steps.push(s),
    );

    // Act, Assert
    await expect(test.start()).rejects.toBe(boom);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(steps).toEqual(["recording", "failed"]);
  });

  it("plays nothing once stopped, as when the window closes", async () => {
    // Arrange
    const { steps, play, recording } = setup();
    const { stream: voice } = stream();
    const test = createVoiceTest(
      () => voice,
      recording,
      (s) => steps.push(s),
    );

    // Act
    const started = test.start();
    test.stop();
    await started;

    // Assert
    expect(play).not.toHaveBeenCalled();
    expect(steps).toEqual(["recording"]);
  });

  it("stays quiet about a failure after it was stopped", async () => {
    // Arrange
    const { steps, recording } = setup({
      record: () => Promise.reject(new Error("aborted")),
    });
    const { stream: voice } = stream();
    const test = createVoiceTest(
      () => voice,
      recording,
      (s) => steps.push(s),
    );

    // Act
    const started = test.start();
    test.stop();
    await started;

    // Assert
    expect(steps).toEqual(["recording"]);
  });
});
