import type { VoiceMode } from "@modular-av/api";
import { createFakeVideoElement } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS, createTable, heard, master } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("voice mode", () => {
  it("saves the voice mode in Foundry's settings and shows it", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    // Act
    await p1.api.commands.setVoiceMode("activity");
    await table.settle();

    // Assert
    expect(master(p1).settings.client.voice.mode).toBe("activity");
    expect(p1.api.state.get().local.voiceMode).toBe("activity");
  });

  it("refuses a mode Foundry doesn't have", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    await expect(
      p1.api.commands.setVoiceMode("loud" as VoiceMode),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(master(p1).settings.client.voice.mode).toBe("ptt");
  });
});

describe("others' video", () => {
  it("stops showing everyone's video, and shows it again", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1");
    await table.settle();
    const element = createFakeVideoElement();
    p1.api.media.attach("gm", "camera", element);

    // Act
    await p1.api.commands.setReceiveVideo(false);
    await table.settle();

    // Assert
    expect(master(p1).settings.client.disableVideo).toBe(true);
    expect(p1.api.state.get().local.receiveVideo).toBe(false);
    expect(p1.env.shownOn(element)).toEqual([]);
    await p1.api.commands.setReceiveVideo(true);
    await table.settle();
    expect(p1.api.state.get().local.receiveVideo).toBe(true);
    expect(p1.env.shownOn(element)).toHaveLength(1);
  });
});

describe("hiding a player for this client", () => {
  it("neither plays nor shows a hidden player, and says so", async () => {
    // Arrange
    const table = createTable();
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    // Act
    await p1.api.commands.setHiddenByMe("gm", true);
    await table.settle();

    // Assert
    expect(master(p1).settings.client.users.gm?.blocked).toBe(true);
    expect(p1.api.state.get().participants.gm).toMatchObject({
      hiddenByMe: true,
      hasAudio: false,
      hasVideo: false,
    });
    expect(heard(p1, gm)).toBeNull();
    expect(gm.api.state.get().participants.p1?.hiddenByMe).toBe(false);
    await p1.api.commands.setHiddenByMe("gm", false);
    await table.settle();
    expect(heard(p1, gm)).not.toBeNull();
  });

  it("refuses unknown players and the player themself", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    await expect(
      p1.api.commands.setHiddenByMe("nobody", true),
    ).rejects.toMatchObject({ code: "unknown-participant" });
    await expect(
      p1.api.commands.setHiddenByMe("p1", true),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
