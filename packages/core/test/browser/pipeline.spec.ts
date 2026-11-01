import type { AVState } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

/** The core with the mock service and real test effects, in Chrome. */
async function openPipeline(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?module=core&service=mock&effects=test");
  await page.waitForFunction(() => window.harness !== undefined);
  expect(errors).toEqual([]);
  await expect
    .poll(() => state(page).then((s) => s.session.status))
    .toBe("connected");
}

const state = (page: Page): Promise<AVState> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { state: { get(): AVState } } | undefined;
    if (!api) throw new Error("no api");
    return api.state.get();
  });

const published = (page: Page) =>
  page.evaluate(() => window.harness?.pipeline?.published() ?? {});

const setEffect = (page: Page, id: string, enabled: boolean) =>
  page.evaluate(
    async ({ effect, on }) => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api as
        | {
            commands: {
              setEffectEnabled(id: string, enabled: boolean): Promise<void>;
            };
          }
        | undefined;
      await api?.commands.setEffectEnabled(effect, on);
    },
    { effect: id, on: enabled },
  );

test("a microphone effect joins the chain without changing the sent track", async ({
  page,
}) => {
  // Arrange
  await openPipeline(page);
  await expect
    .poll(() => published(page).then((p) => p.microphone))
    .toBeTruthy();
  const before = (await published(page)).microphone?.id;

  // Act
  await setEffect(page, "test-gain", true);

  // Assert
  await expect
    .poll(() => state(page).then((s) => s.local.effects["test-gain"]?.status))
    .toBe("running");
  expect((await published(page)).microphone?.id).toBe(before);
  await setEffect(page, "test-gain", false);
  await expect
    .poll(() => state(page).then((s) => s.local.effects["test-gain"]?.status))
    .toBe("off");
  expect((await published(page)).microphone?.id).toBe(before);
});

const record = (page: Page, ms: number) =>
  page.evaluate((duration) => {
    const pipeline = window.harness?.pipeline;
    if (!pipeline) throw new Error("no pipeline");
    return pipeline.record("microphone", duration);
  }, ms);

/** Longer than the gate's hold and fade. */
const GATE_CLOSES_MS = 500;
/** Exact zeros for this long mean the chain sent nothing: 200 ms. */
const SILENCE_SAMPLES = 9600;

/** The fake microphone is always between -60 and 0 dBFS: a test picks. */
async function setGate(page: Page, threshold: number): Promise<void> {
  await page.evaluate(async (level) => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      | {
          commands: {
            setInputSensitivity(sensitivity: {
              auto: boolean;
              threshold: number;
            }): Promise<void>;
          };
        }
      | undefined;
    await api?.commands.setInputSensitivity({ auto: false, threshold: level });
  }, threshold);
}
const openGate = (page: Page): Promise<void> => setGate(page, -60);
const closeGate = async (page: Page): Promise<void> => {
  await setGate(page, 0);
  await page.waitForTimeout(GATE_CLOSES_MS);
};

async function openVoiceActivity(page: Page): Promise<void> {
  await openPipeline(page);
  await expect
    .poll(() => published(page).then((p) => p.microphone))
    .toBeTruthy();
  await openGate(page);
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      | { commands: { setVoiceMode(mode: "activity"): Promise<void> } }
      | undefined;
    await api?.commands.setVoiceMode("activity");
  });
  await expect
    .poll(() => state(page).then((s) => s.local.voiceMode))
    .toBe("activity");
}

const isRunning = (page: Page, id: string) =>
  expect
    .poll(() => state(page).then((s) => s.local.effects[id]?.status))
    .toBe("running");

test("a post effect runs after the voice gate: it keeps sounding while the gate is closed", async ({
  page,
}) => {
  // Arrange
  await openVoiceActivity(page);
  await closeGate(page);
  const dry = await record(page, 1000);

  // Act
  await setEffect(page, "test-hum", true);
  await isRunning(page, "test-hum");
  const hummed = await record(page, 1000);

  // Assert: only what comes after the gate fills its digital silence.
  expect(dry.longestZeroRun).toBeGreaterThan(SILENCE_SAMPLES);
  expect(hummed.longestZeroRun).toBeLessThan(2048);
});

test("a running effect moved ahead of the gate is gated from then on", async ({
  page,
}) => {
  // Arrange
  await openVoiceActivity(page);
  await closeGate(page);
  await setEffect(page, "test-hum", true);
  await isRunning(page, "test-hum");
  const after = await record(page, 1000);

  // Act
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      | {
          commands: {
            setAudioEffectPlace(id: string, at: string): Promise<void>;
          };
        }
      | undefined;
    await api?.commands.setAudioEffectPlace("test-hum", "pre-gate");
  });
  const before = await record(page, 1000);

  // Assert
  expect(after.longestZeroRun).toBeLessThan(2048);
  expect(before.longestZeroRun).toBeGreaterThan(SILENCE_SAMPLES);
  expect((await state(page)).local.effects["test-hum"]?.status).toBe("running");
});

test("a send effect's tail outlives the gate, and turning it off leaves the voice", async ({
  page,
}) => {
  // Arrange
  await openVoiceActivity(page);
  await closeGate(page);
  const dry = await record(page, 1000);

  // Act: speech enters the effect, then the gate closes on its tail.
  await setEffect(page, "test-echo", true);
  await isRunning(page, "test-echo");
  await openGate(page);
  await page.waitForTimeout(1000);
  await closeGate(page);
  const tail = await record(page, 1000);
  await setEffect(page, "test-echo", false);
  await expect
    .poll(() => state(page).then((s) => s.local.effects["test-echo"]?.status))
    .toBe("off");
  await page.waitForTimeout(100);
  const after = await record(page, 1000);
  await openGate(page);
  await page.waitForTimeout(100);
  const voice = await record(page, 1000);

  // Assert
  expect(dry.longestZeroRun).toBeGreaterThan(SILENCE_SAMPLES);
  expect(tail.longestZeroRun).toBeLessThan(2048);
  expect(tail.peak).toBeGreaterThan(0.01);
  expect(after.longestZeroRun).toBeGreaterThan(SILENCE_SAMPLES);
  expect(voice.peak).toBeGreaterThan(0.01);
});

test("a hosted effect rings on after the gate, then the core stops calling it", async ({
  page,
}) => {
  // Arrange
  await openVoiceActivity(page);
  await setEffect(page, "test-hosted", true);
  await isRunning(page, "test-hosted");
  await page.waitForTimeout(1000);

  // Act
  await closeGate(page);
  const tail = await record(page, 400);
  await page.waitForTimeout(1800);
  const done = await record(page, 1000);

  // Assert: past its declared tail it is cut to digital silence.
  expect(tail.peak).toBeGreaterThan(0.01);
  expect(done.peak).toBe(0);
});

test("a tail rings out after mute, then the output closes", async ({
  page,
}) => {
  // Arrange
  await openVoiceActivity(page);
  await setEffect(page, "test-hosted", true);
  await isRunning(page, "test-hosted");
  await page.waitForTimeout(1000);
  await setGate(page, -60);

  // Act
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { commands: { setMuted(muted: boolean): Promise<void> } } | undefined;
    await api?.commands.setMuted(true);
  });
  const tail = await record(page, 300);
  await page.waitForTimeout(2000);
  const closed = await record(page, 500);

  // Assert
  expect(tail.peak).toBeGreaterThan(0.01);
  expect(closed.peak).toBe(0);
});

test("a hosted effect that throws fails plainly, and the voice goes on", async ({
  page,
}) => {
  await openVoiceActivity(page);

  await setEffect(page, "test-hosted-broken", true);

  await expect
    .poll(() =>
      state(page).then((s) => s.local.effects["test-hosted-broken"]?.error),
    )
    .toBe("KernelError");
  expect((await record(page, 500)).peak).toBeGreaterThan(0.01);
});

test("Channel level drops the dry voice only while a send carries it", async ({
  page,
}) => {
  // Arrange
  const command = (
    name: "setAudioChannelLevel" | "setAudioEffectMix",
    ...args: unknown[]
  ) =>
    page.evaluate(
      async ([method, values]) => {
        const api = window.harness?.client.game.modules.get("modular-av")
          ?.api as
          | { commands: Record<string, (...a: unknown[]) => Promise<void>> }
          | undefined;
        await api?.commands[method]?.(...values);
      },
      [name, args] as const,
    );
  await openVoiceActivity(page);
  await command("setAudioChannelLevel", 0);
  await page.waitForTimeout(100);

  // Act: no send yet, so the dry path still carries the voice.
  const alone = await record(page, 1000);
  await setEffect(page, "test-echo", true);
  await isRunning(page, "test-echo");
  await command("setAudioEffectMix", "test-echo", 0.01);
  await page.waitForTimeout(100);
  const carried = await record(page, 1000);
  await command("setAudioEffectMix", "test-echo", 0);
  await page.waitForTimeout(100);
  const unreturned = await record(page, 1000);

  // Assert
  expect(alone.peak).toBeGreaterThan(0.5);
  expect(carried.peak).toBeLessThan(0.1);
  expect(unreturned.peak).toBeGreaterThan(0.5);
});

test("the voice preview is what is sent: Mute silences it, and stopping it leaves the call", async ({
  page,
}) => {
  // Arrange
  await openVoiceActivity(page);
  const voice = (ms: number) =>
    page.evaluate((duration) => {
      const pipeline = window.harness?.pipeline;
      if (!pipeline) throw new Error("no pipeline");
      return pipeline.recordVoice(duration);
    }, ms);
  const setMuted = (muted: boolean) =>
    page.evaluate(async (value) => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api as
        { commands: { setMuted(muted: boolean): Promise<void> } } | undefined;
      await api?.commands.setMuted(value);
    }, muted);

  // Act
  const open = await voice(500);
  await setMuted(true);
  await page.waitForTimeout(GATE_CLOSES_MS);
  const muted = await voice(500);
  await setMuted(false);
  await page.waitForTimeout(GATE_CLOSES_MS);
  const sent = await record(page, 500);

  // Assert
  expect(open.peak).toBeGreaterThan(0.01);
  expect(muted.peak).toBeLessThan(0.001);
  expect(sent.peak).toBeGreaterThan(0.01);
});

test("a camera effect fails closed: only its frames go out, and none while it stalls", async ({
  page,
}) => {
  // Arrange
  await openPipeline(page);
  await expect.poll(() => published(page).then((p) => p.camera)).toBeTruthy();
  const raw = (await published(page)).camera?.id;

  // Act / Assert: once running, the processed track is sent instead.
  await setEffect(page, "test-pass", true);
  await expect
    .poll(() => state(page).then((s) => s.local.cameraHold))
    .toBeNull();
  await expect
    .poll(() => published(page).then((p) => p.camera?.id))
    .not.toBe(raw);
  expect((await published(page)).camera).toBeTruthy();

  // Frames stop: the camera is taken off, raw video is not sent instead.
  await page.evaluate(() => {
    window.harness?.pipeline?.stallVideo(true);
  });
  await expect
    .poll(() => state(page).then((s) => s.local.cameraHold))
    .toBe("effect-stalled");
  await expect
    .poll(() => published(page).then((p) => p.camera))
    .toBeUndefined();

  // Frames again: the processed camera is back.
  await page.evaluate(() => {
    window.harness?.pipeline?.stallVideo(false);
  });
  await expect
    .poll(() => state(page).then((s) => s.local.cameraHold))
    .toBeNull();
  const processed = (await published(page)).camera?.id;
  expect(processed).toBeDefined();
  expect(processed).not.toBe(raw);

  // Turned off: the raw camera goes out again.
  await setEffect(page, "test-pass", false);
  await expect.poll(() => published(page).then((p) => p.camera?.id)).toBe(raw);
});
