import { createFakeMediaEnv, createFakeWorld } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src/call/runtime.ts";
import { createScreenControl } from "../src/call/screen-control.ts";
import { createAVFacts } from "../src/foundry/av-facts.ts";
import { registerScreenShareSetting } from "../src/media/screen-rule.ts";

/** Holds the share's code back until `release`, as a slow network would. */
const load = vi.hoisted(() => {
  let release: () => void = () => undefined;
  let fail = false;
  let gate = Promise.resolve();
  return {
    hold() {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => {
      release();
    },
    failOnce() {
      fail = true;
    },
    wait: async () => {
      await gate;
      if (fail) {
        fail = false;
        throw new Error("chunk failed to load");
      }
    },
  };
});

vi.mock("../src/media/screen-share.ts", async (original) => {
  await load.wait();
  return original();
});

function setup() {
  const client = createFakeWorld({
    users: [{ id: "gm", name: "Gamemaster", role: 4 }],
    av: { mode: 3 },
  }).connect("gm");
  registerScreenShareSetting(client.game, () => undefined);
  client.runLifecycle();
  const rt = createRuntime(false);
  rt.session = { ...rt.session, status: "connected" };
  rt.capabilities = { speakingDetection: true, screenShare: { audio: true } };
  const env = createFakeMediaEnv();
  const errors: unknown[] = [];
  const control = createScreenControl({
    game: client.game,
    facts: createAVFacts(client.game),
    rt,
    env,
    onChange: () => undefined,
    onError: (e) => errors.push(e),
  });
  return { control, env, rt, errors };
}

describe("the screen share's control", () => {
  it("opens no picker when stopped while its code was loading", async () => {
    load.hold();
    const { control, env } = setup();

    const starting = control.start(false);
    control.stop();
    load.release();
    await starting;

    expect(env.displayCaptures).toEqual([]);
    expect(control.video).toBeNull();
  });

  it("checks again once its code loaded: a share refused meanwhile never opens", async () => {
    load.hold();
    const { control, env, rt } = setup();

    const starting = control.start(false);
    rt.capabilities = { speakingDetection: true };
    load.release();

    await expect(starting).rejects.toMatchObject({ code: "unsupported" });
    expect(env.displayCaptures).toEqual([]);
  });
});
