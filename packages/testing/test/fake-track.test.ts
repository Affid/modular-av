import { describe, expect, it, vi } from "vitest";
import {
  createFakeTrack,
  endFakeTrack,
  fakeTrackInfo,
} from "../src/service/fake-track.ts";

describe("fake tracks", () => {
  it("end like an unplugged device: ended, with an ended event", () => {
    const track = createFakeTrack("audio");
    const ended = vi.fn();
    track.addEventListener("ended", ended);

    endFakeTrack(track);

    expect(fakeTrackInfo(track).readyState).toBe("ended");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("refuse real tracks", () => {
    expect(() => {
      endFakeTrack({} as MediaStreamTrack);
    }).toThrow(/not a fake track/);
  });
});
