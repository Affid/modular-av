import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolutionConstraints } from "../src/media/video-resolution.ts";
import { ALWAYS, createTable } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the camera's resolution", () => {
  it("leaves the size to the browser by default", async () => {
    // Arrange / Act
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    // Assert
    expect(p1.api.state.get().local.videoResolution).toBe("default");
    expect(p1.env.videoCaptures.map((c) => c.resolution)).toEqual(["default"]);
  });

  it("captures the running camera again at the chosen size, after letting the old capture go", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const before = p1.core.controller().local.camera;

    // Act
    await p1.api.commands.setVideoResolution("720p");
    await table.settle();

    // Assert
    const last = p1.env.videoCaptures.at(-1);
    expect(last).toMatchObject({ resolution: "720p", previousLive: false });
    expect(p1.api.state.get().local.videoResolution).toBe("720p");
    expect(p1.api.state.get().local.hasCamera).toBe(true);
    expect(p1.core.controller().local.camera).not.toBe(before);
    expect(p1.client.game.settings.get("modular-av", "videoResolution")).toBe(
      "720p",
    );
  });

  it("resolves once the running camera was captured again at the new size", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const before = p1.core.controller().local.camera;

    // Act: nothing else runs the queue meanwhile.
    await p1.api.commands.setVideoResolution("720p");

    // Assert
    expect(p1.env.videoCaptures.at(-1)?.resolution).toBe("720p");
    const after = p1.core.controller().local.camera;
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it("captures a camera turned on later at the saved size", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", {
      av: ALWAYS,
      deny: { video: "NotAllowedError" },
    });
    await table.settle();
    await p1.api.commands.setVideoResolution("1080p");
    await table.settle();

    p1.env.setDenied("video", undefined);
    await p1.api.commands.setDevice("videoInput", "hd");
    await table.settle();

    expect(p1.env.videoCaptures.at(-1)).toMatchObject({
      deviceId: "hd",
      resolution: "1080p",
    });
    expect(p1.api.state.get().local.hasCamera).toBe(true);
  });

  it("doesn't capture again when the size stays the same", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    await p1.api.commands.setVideoResolution("720p");
    await table.settle();
    const count = p1.env.videoCaptures.length;

    await p1.api.commands.setVideoResolution("720p");
    await p1.api.commands.setMuted(true);
    await table.settle();

    expect(p1.env.videoCaptures).toHaveLength(count);
  });

  it("refuses a size it doesn't know", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    await expect(
      p1.api.commands.setVideoResolution("4k" as never),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(p1.api.state.get().local.videoResolution).toBe("default");
  });
});

describe("resolutionConstraints", () => {
  it("asks for nothing by default", () => {
    expect(resolutionConstraints("default")).toEqual({});
  });

  it("only ever asks for an ideal size, so a camera that can't do it still works", () => {
    // Act
    const sizes = (["360p", "720p", "1080p"] as const).map(
      resolutionConstraints,
    );

    // Assert
    expect(sizes).toEqual(
      [
        ...[{ width: { ideal: 640 }, height: { ideal: 360 } }],
        ...[{ width: { ideal: 1280 }, height: { ideal: 720 } }],
        ...[{ width: { ideal: 1920 }, height: { ideal: 1080 } }],
      ].map((size) => ({ ...size, frameRate: { ideal: 30 } })),
    );
    expect(JSON.stringify(sizes)).not.toMatch(/exact|min|max/);
  });
});
