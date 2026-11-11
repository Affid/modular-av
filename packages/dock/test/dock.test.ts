// @vitest-environment happy-dom
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { fakeHost, settle, testDock } from "./context.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });
const p1 = participantState({ id: "p1", name: "Player1" });

function mounted(state = avState({ participants: [me, p1] }), options = {}) {
  const dock = testDock({ state, ...options });
  const host = fakeHost();
  camerasSurface(dock.ctx).mount(host);
  const tile = (id: string): HTMLElement | null =>
    host.element.querySelector(`.mav-dock-tile[data-participant-id="${id}"]`);
  const button = (name: string): HTMLButtonElement | null =>
    host.element.querySelector(`.mav-dock-${name}`);
  return { ...dock, host, tile, button };
}

describe("the dock's tiles", () => {
  it("shows the local player and everyone in the call, each with its video attached", () => {
    const { tile, api } = mounted();

    expect(tile("me")).not.toBeNull();
    expect(tile("p1")?.querySelector(".mav-dock-tile-name")?.textContent).toBe(
      "Player1",
    );
    expect(api.attachments.map((a) => [a.participant, a.source])).toEqual([
      ["me", "camera"],
      ["p1", "camera"],
    ]);
  });

  it("shows each state the core reports, and follows changes", async () => {
    // Arrange
    const { tile, api } = mounted();

    // Act
    api.setState((s) => ({
      ...s,
      participants: {
        ...s.participants,
        p1: {
          ...p1,
          speaking: true,
          muted: true,
          deafened: true,
          quality: "poor",
        },
      },
    }));
    await settle();

    // Assert
    const element = tile("p1");
    expect(element?.hasAttribute("data-speaking")).toBe(true);
    expect(element?.hasAttribute("data-muted")).toBe(true);
    expect(element?.dataset.quality).toBe("poor");
    expect(
      Array.from(
        element?.querySelectorAll("[data-indicator]") ?? [],
        (i) => (i as HTMLElement).dataset.indicator,
      ),
    ).toEqual(["muted", "deafened", "connection"]);
    expect(
      element
        ?.querySelector('[data-indicator="muted"]')
        ?.getAttribute("aria-label"),
    ).toBe("Muted");
  });

  it("drops a player who left and keeps the others' tiles", async () => {
    const { tile, api } = mounted();
    const kept = tile("me");

    api.setState((s) => ({ ...s, participants: { me } }));
    await settle();

    expect(tile("p1")).toBeNull();
    expect(tile("me")).toBe(kept);
    expect(api.attachments.find((a) => a.participant === "p1")?.detached).toBe(
      true,
    );
  });

  it("keeps a player's name out of Foundry's HTML tooltips", () => {
    const evil = participantState({
      id: "p1",
      name: "<img src=x onerror=alert(1)>",
    });
    const { tile } = mounted(avState({ participants: [me, evil] }));

    const name = tile("p1")?.querySelector<HTMLElement>(".mav-dock-tile-name");
    if (!name) throw new Error("no name");
    expect(name.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(name.dataset.tooltip).toBeUndefined();
    expect(document.querySelector("img[src=x]")).toBeNull();
  });

  it("meters the local player on their tile", () => {
    const { tile, api } = mounted();

    api.emitLevel("me", { db: -40, threshold: -50, open: true });

    const fill = tile("me")?.querySelector<HTMLElement>(".mav-meter-fill");
    expect(fill?.style.transform).toBe("scaleX(0.5)");
  });
});

describe("shared screens", () => {
  const sharing = avState({
    participants: [me, { ...p1, hasScreen: true }],
  });

  it("shows a shared screen in a tile of its own, after the player's camera", () => {
    const { host, api } = mounted(sharing);

    const tiles = Array.from(
      host.element.querySelectorAll<HTMLElement>(".mav-dock-tile"),
      (t) => `${t.dataset.participantId ?? ""}:${t.dataset.source ?? ""}`,
    );
    expect(tiles).toEqual(["me:camera", "p1:camera", "p1:screen"]);
    const screen = host.element.querySelector('[data-source="screen"]');
    expect(screen?.querySelector(".mav-dock-tile-name")?.textContent).toBe(
      "Player1's screen",
    );
    expect(screen?.getAttribute("data-video")).toBe("on");
    expect(
      api.attachments.map((a) => [a.participant, a.source]),
    ).toContainEqual(["p1", "screen"]);
  });

  it("names the player's own share as theirs", () => {
    const { host } = mounted(
      avState({ participants: [{ ...me, hasScreen: true }] }),
    );

    const screen = host.element.querySelector('[data-source="screen"]');
    expect(screen?.querySelector(".mav-dock-tile-name")?.textContent).toBe(
      "Your screen",
    );
    expect(screen?.querySelector(".mav-meter")).toBeNull();
  });

  it("keeps another player large by default while the local player shares", () => {
    const { host } = mounted(
      avState({ participants: [{ ...me, hasScreen: true }, p1] }),
    );

    const large = host.element.querySelector<HTMLElement>("[data-focused]");
    expect(large?.dataset.tileKey).toBe("p1");
  });

  it("drops the screen's tile when the share stops", async () => {
    const { host, api } = mounted(sharing);

    api.setState((s) => ({
      ...s,
      participants: { ...s.participants, p1 },
    }));
    await settle();

    expect(host.element.querySelector('[data-source="screen"]')).toBeNull();
    expect(
      host.element.querySelector('[data-participant-id="p1"]'),
    ).not.toBeNull();
  });
});

const shareable = {
  active: false,
  audio: false,
  available: true,
  audioAvailable: true,
  rule: "video",
} as const;

describe("the share button", () => {
  it("shares the screen with its sound, and stops it, as the core says", async () => {
    // Arrange
    const state = avState({
      participants: [me],
      local: { screenShare: shareable },
    });
    const { button, api } = mounted(state);

    // Act
    button("screen")?.click();
    api.setState((s) => ({
      ...s,
      local: { ...s.local, screenShare: { ...shareable, active: true } },
    }));
    await settle();

    // Assert
    expect(api.calls).toContainEqual({
      command: "startScreenShare",
      args: [{ audio: true }],
    });
    expect(button("screen")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("screen")?.getAttribute("aria-label")).toBe(
      "Stop sharing your screen",
    );
    button("screen")?.click();
    expect(api.calls.at(-1)).toEqual({ command: "stopScreenShare", args: [] });
  });

  it("is hidden where no share can start", () => {
    const { button } = mounted();

    expect(button("screen")?.hidden).toBe(true);
  });

  it("says nothing when the player closes the browser's picker", async () => {
    const state = avState({
      participants: [me],
      local: { screenShare: shareable },
    });
    const { button, api, host } = mounted(state);
    api.failNext(
      "startScreenShare",
      new DOMException("Permission denied", "NotAllowedError"),
    );

    button("screen")?.click();
    await settle();

    expect(host.element.querySelector(".mav-dock-alert")?.textContent).toBe("");
  });
});

describe("the voice panel", () => {
  it("runs the core's commands and shows what the core says", async () => {
    // Arrange
    const { button, api } = mounted();

    // Act
    button("mute")?.click();
    api.setState((s) => ({ ...s, local: { ...s.local, muted: true } }));
    await settle();

    // Assert
    expect(api.calls).toContainEqual({ command: "setMuted", args: [true] });
    expect(button("mute")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("mute")?.getAttribute("aria-label")).toBe("Unmute");
    button("deafen")?.click();
    button("video")?.click();
    expect(api.calls.map((c) => c.command)).toEqual([
      "setMuted",
      "setDeafened",
      "setVideoEnabled",
    ]);
  });

  it("can't unmute against a GM's block", () => {
    const blocked = avState({
      participants: [me],
      local: { muted: true, canPublish: { audio: false, video: true } },
    });
    const { button } = mounted(blocked);

    expect(button("mute")?.disabled).toBe(true);
  });

  it("shows open mic and the other warnings", () => {
    const warned = avState({
      participants: [me],
      local: { openMic: true, cameraHold: "effect-failed" },
    });
    const { host } = mounted(warned);

    const shown = Array.from(
      host.element.querySelectorAll(".mav-dock-warnings [data-indicator]"),
      (i) => (i as HTMLElement).dataset.indicator,
    );
    expect(shown).toEqual(["open-mic", "effect-failed"]);
  });

  it("tells why a command failed", async () => {
    const { button, api, host } = mounted();
    api.failNext("setMuted", new Error("You may not send audio"));

    button("mute")?.click();
    await settle();

    expect(host.element.querySelector(".mav-dock-alert")?.textContent).toBe(
      "That didn't work: You may not send audio",
    );
  });

  it("opens the settings window", () => {
    const { button, opened } = mounted();

    button("settings")?.click();

    expect(opened.settings).toBe(1);
  });
});

describe("the session's status", () => {
  it("counts down while retrying and offers to reconnect now", () => {
    const { host, button, api } = mounted(
      avState({
        participants: [me],
        session: { status: "retrying", nextRetryAt: 1_004_200, attempt: 1 },
      }),
    );

    const status = host.element.querySelector<HTMLElement>(".mav-dock-status");
    expect(status?.dataset.status).toBe("reconnecting");
    expect(status?.textContent).toBe("Connection lost, trying again in 5 s");
    expect(button("action")?.hidden).toBe(false);
    button("action")?.click();
    expect(api.calls).toContainEqual({ command: "reconnectNow", args: [] });
  });

  it("offers to rejoin after leaving, and no leave button", () => {
    const { button, api } = mounted(
      avState({
        participants: [me],
        session: { status: "left", reason: "left" },
      }),
    );

    expect(button("leave")?.hidden).toBe(true);
    button("action")?.click();
    expect(api.calls).toContainEqual({ command: "rejoin", args: [] });
  });
});
