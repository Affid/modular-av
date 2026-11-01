import type { AudioPlace, AVState } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";
import {
  FAKE_SPEECH_WAV,
  writeFakeSpeech,
} from "../../../../scripts/foundry/fake-speech.ts";

/**
 * The routing with a real reverb and the real voice gate, on a fake microphone
 * that talks for 1.5 s and is silent for 1.5 s.
 */
const THRESHOLD_DB = -50;
/** Two rounds of speech and silence. */
const WATCH_MS = 6000;
const POLL_MS = 50;
/** The gate has let go by then. */
const WAIT_MS = 600;
const SETTLE_MS = 2000;

writeFakeSpeech();

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${FAKE_SPEECH_WAV}`,
    ],
  },
});

interface Commands {
  setVoiceMode(mode: "activity"): Promise<void>;
  setInputSensitivity(s: { auto: boolean; threshold: number }): Promise<void>;
  setEffectEnabled(id: string, on: boolean): Promise<void>;
  setAudioEffectPlace(id: string, place: AudioPlace): Promise<void>;
}

async function openReverb(page: Page, place: AudioPlace | null): Promise<void> {
  await page.goto("/?module=audio-reverb&service=mock");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect
    .poll(() =>
      page.evaluate(() => window.harness?.pipeline?.published().microphone),
    )
    .toBeTruthy();
  await page.evaluate(
    async ({ at, threshold }) => {
      const { game } = window.harness?.client ?? {};
      const commands = (
        game?.modules.get("modular-av")?.api as
          { commands: Commands } | undefined
      )?.commands;
      await game?.settings.set("modular-av-audio-reverb", "decay", 3);
      await commands?.setVoiceMode("activity");
      await commands?.setInputSensitivity({ auto: false, threshold });
      if (!at) return;
      await commands?.setAudioEffectPlace("reverb", at);
      await commands?.setEffectEnabled("reverb", true);
    },
    { at: place, threshold: THRESHOLD_DB },
  );
  await expect
    .poll(() => localState(page).then((local) => local.effects.reverb?.status))
    .toBe(place ? "running" : "off");
  await page.waitForTimeout(SETTLE_MS);
}

const localState = (page: Page): Promise<AVState["local"]> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { state: { get(): AVState } } | undefined;
    if (!api) throw new Error("no api");
    return api.state.get().local;
  });

/** How much of the time the gate is open, 0 to 1. */
const gateShare = (page: Page): Promise<number> =>
  page.evaluate(
    async ({ total, step }) => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api as
        { state: { get(): AVState } } | undefined;
      let open = 0;
      const polls = Math.floor(total / step);
      for (let i = 0; i < polls; i += 1) {
        if (api?.state.get().local.broadcasting) open += 1;
        await new Promise((resolve) => setTimeout(resolve, step));
      }
      return open / polls;
    },
    { total: WATCH_MS, step: POLL_MS },
  );

const peakSent = (page: Page, ms: number): Promise<number> =>
  page.evaluate(async (duration) => {
    const recording = await window.harness?.pipeline?.record(
      "microphone",
      duration,
    );
    return recording?.peak ?? 0;
  }, ms);

test("a reverb ahead of the gate holds it open, and on a send it doesn't", async ({
  browser,
}) => {
  // Act
  const openAt = async (place: AudioPlace | null): Promise<number> => {
    const page = await browser.newPage({
      permissions: ["camera", "microphone"],
    });
    await openReverb(page, place);
    const share = await gateShare(page);
    await page.close();
    return share;
  };
  const alone = await openAt(null);
  const onSend = await openAt("send");
  const preGate = await openAt("pre-gate");

  // Assert: the warning the mixer gives is true.
  test.info().annotations.push({
    type: "gate open: alone, send, pre-gate",
    description: [alone, onSend, preGate]
      .map((share) => `${(share * 100).toFixed(0)}%`)
      .join(", "),
  });
  expect(Math.abs(onSend - alone)).toBeLessThan(0.1);
  expect(preGate).toBeGreaterThan(alone + 0.15);
});

test("a send's tail dies away by itself once the gate has closed", async ({
  page,
}) => {
  // Arrange
  await openReverb(page, "send");

  // Act: the gate shuts for good, on a tail still ringing.
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { commands: Commands } | undefined;
    await api?.commands.setInputSensitivity({ auto: false, threshold: 0 });
  });
  await page.waitForTimeout(WAIT_MS);
  const first = await peakSent(page, 400);
  const second = await peakSent(page, 400);
  const third = await peakSent(page, 400);

  // Assert
  test.info().annotations.push({
    type: "tail",
    description: `${first.toFixed(4)}, ${second.toFixed(4)}, ${third.toFixed(4)}`,
  });
  expect(first).toBeGreaterThan(0.0005);
  expect(second).toBeLessThan(first);
  expect(third).toBeLessThan(second);
  expect(third).toBeGreaterThan(0);
});
