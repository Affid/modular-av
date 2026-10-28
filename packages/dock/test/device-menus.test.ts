// @vitest-environment happy-dom
import type {
  AudioEffectDefinition,
  ControlContribution,
  VideoEffectDefinition,
} from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { openCameraMenu, openMicMenu } from "../src/panel/device-menus.ts";
import { fakeHost, settle, type TestDock, testDock } from "./context.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });

const denoise: AudioEffectDefinition = {
  id: "rnnoise",
  kind: "audio",
  label: "RNNoise",
  stage: "denoise",
  exclusiveGroup: "noise-suppression",
  cost: "light",
  isSupported: () => true,
  create: () => Promise.reject(new Error("unused")),
};

const blur: VideoEffectDefinition = {
  id: "background-blur",
  kind: "video",
  label: "Blur",
  exclusiveGroup: "camera-background",
  cost: "medium",
  isSupported: () => true,
  create: () => Promise.reject(new Error("unused")),
};

function devicesDock(voiceMode: "always" | "activity" | "ptt" = "always") {
  const dock = testDock({
    state: avState({
      participants: [me],
      local: {
        voiceMode,
        chosenDevices: {
          audioInput: "focusrite",
          videoInput: "webcam",
          audioOutput: "default",
        },
      },
      devices: {
        audioInput: [{ id: "focusrite", label: "Focusrite USB" }],
        videoInput: [{ id: "webcam", label: "Webcam" }],
        audioOutput: [{ id: "headphones", label: "Headphones" }],
      },
    }),
  });
  dock.api.effects.register(denoise);
  dock.api.effects.register(blur);
  return dock;
}

function open(dock: TestDock, menu: typeof openMicMenu) {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const popover = menu(dock.ctx, anchor);
  const labelled = (text: string): HTMLElement | null => {
    const label = [
      ...popover.element.querySelectorAll<HTMLLabelElement>("label"),
    ].find((l) => l.textContent === text);
    return label?.htmlFor
      ? popover.element.querySelector<HTMLElement>(`#${label.htmlFor}`)
      : null;
  };
  const choice = (name: string): HTMLButtonElement | null =>
    [...popover.element.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === name,
    ) ?? null;
  return { popover, labelled, choice, text: () => popover.element.textContent };
}

describe("the microphone menu", () => {
  it("picks the microphone and speakers, and offers noise cancellation", () => {
    const { labelled, popover } = open(devicesDock(), openMicMenu);

    expect((labelled("Microphone") as HTMLSelectElement).value).toBe(
      "focusrite",
    );
    expect(labelled("Speakers")).not.toBeNull();
    expect(labelled("Camera")).toBeNull();
    expect(
      popover.element.querySelector('[data-effect-group="noise-suppression"]'),
    ).not.toBeNull();
    expect(
      popover.element.querySelector('[data-effect-group="camera-background"]'),
    ).toBeNull();
  });

  it("switches the input mode at once", async () => {
    const dock = devicesDock();
    const { labelled } = open(dock, openMicMenu);
    const mode = labelled("Input mode") as HTMLSelectElement;

    expect(mode.value).toBe("always");
    mode.value = "activity";
    mode.dispatchEvent(new Event("change"));
    await settle();

    expect(dock.api.calls).toContainEqual({
      command: "setVoiceMode",
      args: ["activity"],
    });
  });

  it("shows the sensitivity only in voice activity, and sets it live", async () => {
    const quiet = open(devicesDock("always"), openMicMenu);
    expect(quiet.popover.element.querySelector(".mav-sensitivity")).toBeNull();
    document.body.replaceChildren();

    const dock = devicesDock("activity");
    const { popover } = open(dock, openMicMenu);
    const handle = popover.element.querySelector<HTMLInputElement>(
      ".mav-sensitivity-handle",
    );
    const auto = popover.element.querySelector<HTMLElement>('[role="switch"]');
    expect(handle).not.toBeNull();
    auto?.click();
    if (handle) {
      handle.value = "-45";
      handle.dispatchEvent(new Event("change"));
    }
    await settle();

    // Automatic by default: the switch turns it off.
    expect(dock.api.calls).toContainEqual({
      command: "setInputSensitivity",
      args: [{ auto: false }],
    });
    expect(dock.api.calls).toContainEqual({
      command: "setInputSensitivity",
      args: [{ threshold: -45 }],
    });
  });
});

describe("the microphone menu while open", () => {
  it("adds the sensitivity when voice activity is chosen, and drops it after", async () => {
    const dock = devicesDock("always");
    const { popover } = open(dock, openMicMenu);
    const bar = () => popover.element.querySelector(".mav-sensitivity");

    dock.api.setState((s) => ({
      ...s,
      local: { ...s.local, voiceMode: "activity" },
    }));
    await settle();
    expect(bar()).not.toBeNull();

    dock.api.setState((s) => ({
      ...s,
      local: { ...s.local, voiceMode: "ptt" },
    }));
    await settle();
    expect(bar()).toBeNull();
  });

  it("stops reading the level once closed", async () => {
    const dock = devicesDock("activity");
    const { popover } = open(dock, openMicMenu);
    const active = () =>
      dock.api.meterSubscriptions.filter((m) => m.active).length;
    expect(active()).toBe(1);

    popover.close();
    await settle();

    expect(active()).toBe(0);
  });
});

describe("the camera menu", () => {
  it("picks the camera and offers the camera background", () => {
    const { labelled, popover } = open(devicesDock(), openCameraMenu);

    expect((labelled("Camera") as HTMLSelectElement).value).toBe("webcam");
    expect(labelled("Microphone")).toBeNull();
    expect(
      popover.element.querySelector('[data-effect-group="camera-background"]'),
    ).not.toBeNull();
  });
});

describe("the voice panel's menus", () => {
  function mounted(dock: TestDock) {
    const host = fakeHost();
    camerasSurface(dock.ctx).mount(host);
    return (name: string): HTMLButtonElement | null =>
      host.element.querySelector(`.mav-dock-${name}`);
  }

  it("has an arrow beside the microphone and the camera, each named", () => {
    const button = mounted(devicesDock());

    expect(button("mic-menu")?.getAttribute("aria-label")).toBe(
      "Microphone options",
    );
    expect(button("camera-menu")?.getAttribute("aria-label")).toBe(
      "Camera options",
    );
    expect(button("mic-menu")?.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("hides the sliders unless a module adds controls of its own", () => {
    const plain = devicesDock();
    expect(mounted(plain)("quick")?.hidden).toBe(true);
    document.body.replaceChildren();

    const withControls = devicesDock();
    // Only where it goes matters here: it isn't rendered.
    const sample = {
      kind: "control",
      place: "quick",
      type: "toggle",
      id: "sample.toggle",
      label: "Sample toggle",
    } as unknown as ControlContribution;
    withControls.api.contributions.register(sample);

    expect(mounted(withControls)("quick")?.hidden).toBe(false);
  });
});
