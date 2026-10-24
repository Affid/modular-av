import type { DeviceKind } from "@modular-av/api";
import { FAKE_DEVICES } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS, createTable, master } from "./table.ts";

const USB = {
  ...FAKE_DEVICES,
  audioInput: [
    ...FAKE_DEVICES.audioInput,
    { id: "usb", label: "USB microphone" },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("devices", () => {
  it("lists the browser's devices once the core is up", async () => {
    // Arrange / Act
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    // Assert
    expect(p1.api.state.get().devices).toEqual(FAKE_DEVICES);
  });

  it("follows devices being plugged in", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    p1.env.setDevices(USB);
    await table.settle();

    expect(p1.api.state.get().devices.audioInput).toHaveLength(2);
  });

  it("saves the chosen microphone and camera in Foundry's settings, and captures them", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    await p1.api.commands.setDevice("audioInput", "usb");
    await p1.api.commands.setDevice("videoInput", "hd");
    await table.settle();

    const client = master(p1).settings.client;
    expect([client.audioSrc, client.videoSrc]).toEqual(["usb", "hd"]);
    expect(p1.env.captures).toContain("audio:usb");
    expect(p1.env.captures).toContain("video:hd");
  });

  it("plays everyone through the chosen speakers", async () => {
    const table = createTable();
    table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1");
    await table.settle();

    await p1.api.commands.setDevice("audioOutput", "headphones");
    await table.settle();

    expect(master(p1).settings.client.audioSink).toBe("headphones");
    expect(p1.env.outputs.map((o) => o.state.sinkId)).toContain("headphones");
  });

  it("refuses unknown kinds and empty ids", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    await expect(
      p1.api.commands.setDevice("printer" as DeviceKind, "x"),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      p1.api.commands.setDevice("audioInput", ""),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
