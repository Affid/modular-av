// @vitest-environment happy-dom
import type { VideoEffectDefinition } from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import { createDraft } from "../src/settings-window/draft.ts";
import type { Themes } from "../src/themes/choice.ts";
import { settle, testDock } from "./context.ts";

const me = participantState({ id: "me", name: "Me", isLocal: true });

const setting = (namespace: string, key: string, value: unknown) => ({
  namespace,
  key,
  scope: "world" as const,
  value,
});

const WORLD = setting("core", "rtcWorldSettings", {
  mode: 3,
  turn: { type: "server", url: "", username: "", password: "" },
});

describe("the settings window's draft", () => {
  it("changes nothing until saved, then applies only what changed", async () => {
    // Arrange
    const dock = testDock({ state: avState({ participants: [me] }) });
    const draft = createDraft(dock.ctx);

    // Act
    draft.set("voiceMode", "ptt");
    draft.set("threshold", -30);
    draft.set("pttKey", "KeyV");

    // Assert
    expect(dock.api.calls).toEqual([]);
    expect(draft.changed()).toEqual(["voiceMode", "pttKey", "threshold"]);
    expect(draft.reloads()).toBeNull();
    await draft.save();
    expect(dock.api.calls).toEqual([
      { command: "setVoiceMode", args: ["ptt"] },
      { command: "setInputSensitivity", args: [{ threshold: -30 }] },
    ]);
    expect(dock.pushToTalkSet).toEqual([["KeyV"]]);
    expect(draft.changed()).toEqual([]);
    expect(dock.reloads).toEqual([]);
  });

  it("reloads everyone when a GM turns calls off or swaps the service", async () => {
    const dock = testDock({
      isGM: true,
      state: avState({ participants: [me] }),
      foundrySettings: [WORLD, setting("modular-av", "service", "livekit")],
    });
    const draft = createDraft(dock.ctx);

    draft.set("worldMode", "off");
    draft.set("service", "p2p");
    expect(draft.reloads()).toBe("everyone");
    await draft.save();

    expect(dock.saved.get("core.rtcWorldSettings")).toEqual({
      mode: 0,
      turn: { type: "server", url: "", username: "", password: "" },
    });
    expect(dock.saved.get("modular-av.service")).toBe("p2p");
    expect(dock.reloads).toEqual([true]);
  });

  it("reloads only this page for a player's own cameras, and ignores a GM's fields", () => {
    const dock = testDock({
      state: avState({ participants: [me] }),
      foundrySettings: [WORLD, setting("modular-av", "camerasPlayer", "")],
    });
    const draft = createDraft(dock.ctx);

    draft.set("camerasOwn", "foundry");
    draft.set("worldMode", "off");

    expect(draft.changed()).toEqual(["camerasOwn"]);
    expect(draft.reloads()).toBe("self");
  });

  it("switches the effects whose choice changed, and resets", async () => {
    const dock = testDock({
      state: avState({
        participants: [me],
        local: {
          effects: {
            "background-blur": { status: "off", error: null },
            "background-replace": { status: "running", error: null },
          },
        },
      }),
    });
    for (const id of ["background-blur", "background-replace"])
      dock.api.effects.register({
        id,
        kind: "video",
        label: id,
        exclusiveGroup: "camera-background",
        cost: "medium",
        isSupported: () => true,
        create: () => Promise.reject(new Error("unused")),
      } satisfies VideoEffectDefinition);
    const draft = createDraft(dock.ctx);
    expect(draft.get("effects")).toEqual({
      "camera-background": "background-replace",
    });

    draft.set("effects", { "camera-background": "" });
    draft.reset();
    expect(draft.changed()).toEqual([]);
    draft.set("effects", { "camera-background": "background-blur" });
    await draft.save();

    expect(dock.api.calls).toEqual([
      { command: "setEffectEnabled", args: ["background-blur", true] },
    ]);
  });

  it("gives a GM one theme, everyone's, which they see too", async () => {
    const chosen: string[] = [];
    const themes: Themes = {
      list: () => [],
      own: () => "vines",
      worldDefault: () => "default",
      shown: () => null,
      choose: (id) => {
        chosen.push(`own:${id}`);
        return Promise.resolve();
      },
      chooseWorldDefault: (id) => {
        chosen.push(`world:${id}`);
        return Promise.resolve();
      },
      onChange: () => () => undefined,
      changed: () => undefined,
    };
    const dock = testDock({
      isGM: true,
      state: avState({ participants: [me] }),
      themes,
    });
    const draft = createDraft(dock.ctx);
    expect(draft.get("theme")).toBe("default");

    draft.set("theme", "vines");
    await draft.save();

    expect(chosen).toEqual(["world:vines", "own:"]);
  });

  it("follows changes made elsewhere in the fields nobody drafted", async () => {
    const dock = testDock({ state: avState({ participants: [me] }) });
    const draft = createDraft(dock.ctx);
    draft.set("threshold", -20);

    dock.api.setState((s) => ({
      ...s,
      local: {
        ...s.local,
        voiceMode: "activity",
        inputSensitivity: { auto: false, threshold: -60 },
      },
    }));
    await settle();
    draft.sync();

    expect(draft.get("voiceMode")).toBe("activity");
    expect(draft.get("sensitivityAuto")).toBe(false);
    // The drafted threshold stays the player's.
    expect(draft.get("threshold")).toBe(-20);
    expect(draft.changed()).toEqual(["threshold"]);
  });

  it("after a failed save, says what is still unsaved and reloads nothing", async () => {
    const dock = testDock({
      isGM: true,
      state: avState({ participants: [me] }),
      foundrySettings: [WORLD, setting("modular-av", "service", "livekit")],
    });
    const draft = createDraft(dock.ctx);
    draft.set("voiceMode", "ptt");
    draft.set("receiveVideo", false);
    draft.set("service", "p2p");
    let heard: readonly string[] = [];
    draft.subscribe(() => {
      heard = draft.changed();
    });
    dock.api.failNext("setReceiveVideo", new Error("refused"));

    await expect(draft.save()).rejects.toThrow("refused");

    expect(draft.changed()).toEqual(["receiveVideo", "service"]);
    // Listeners hear it too: the footer counts what is left.
    expect(heard).toEqual(["receiveVideo", "service"]);
    expect(dock.reloads).toEqual([]);
  });

  it("records what it applied, not what was drafted while saving", async () => {
    const dock = testDock({ state: avState({ participants: [me] }) });
    const draft = createDraft(dock.ctx);
    draft.set("voiceMode", "ptt");

    const saving = draft.save();
    draft.set("voiceMode", "activity");
    await saving;

    expect(draft.savedValue("voiceMode")).toBe("ptt");
    expect(draft.changed()).toEqual(["voiceMode"]);
  });

  it("saves once while a save is under way", async () => {
    const dock = testDock({ state: avState({ participants: [me] }) });
    const draft = createDraft(dock.ctx);
    draft.set("voiceMode", "ptt");

    const first = draft.save();
    expect(draft.saving()).toBe(true);
    await Promise.all([first, draft.save()]);

    expect(dock.api.calls).toEqual([
      { command: "setVoiceMode", args: ["ptt"] },
    ]);
    expect(draft.saving()).toBe(false);
  });

  it("resets to what changed elsewhere, even in a drafted field", async () => {
    const dock = testDock({ state: avState({ participants: [me] }) });
    const draft = createDraft(dock.ctx);
    draft.set("voiceMode", "ptt");

    dock.api.setState((s) => ({
      ...s,
      local: { ...s.local, voiceMode: "always" },
    }));
    await settle();
    draft.sync();
    draft.reset();

    expect(draft.get("voiceMode")).toBe("always");
    expect(draft.changed()).toEqual([]);
  });

  it("holds no relay password for a player", () => {
    const dock = testDock({
      state: avState({ participants: [me] }),
      foundrySettings: [
        setting("core", "rtcWorldSettings", {
          mode: 3,
          turn: {
            type: "custom",
            url: "turn:x",
            username: "u",
            password: "pw",
          },
        }),
      ],
    });

    const draft = createDraft(dock.ctx);

    expect(draft.get("relay").password).toBe("");
  });
});
