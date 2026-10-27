import { vi } from "vitest";

/** Just enough of MediaStream for the module (Node has none). */
class FakeMediaStream {
  private tracks: MediaStreamTrack[];

  constructor(tracks: readonly MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  removeTrack(track: MediaStreamTrack): void {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}

export function installMediaStream(): void {
  vi.stubGlobal("MediaStream", FakeMediaStream);
}
