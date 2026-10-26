// First release: a player's own choices from LiveKit AVClient, kept in
// their browser, are brought over by each module once, in the local world.
import { expect, test } from "@playwright/test";
import {
  configureWorld,
  openPlayer,
  openSecondTab,
  type Player,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "dock");
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

/** What LiveKit AVClient left in a player's browser, as Foundry stores it. */
const OLD: Readonly<Record<string, unknown>> = {
  audioAutoSensitivity: false,
  audioNoiseGateThreshold: -42,
  enhancedNoiseCancellation: true,
  noiseSuppressionModel: "rnnoise",
  dockLayout: "focus",
  videoBackground: "blur",
  videoBlurStrength: 0.3,
};

test("a player's sensitivity, noise model, dock and background come over", async ({
  browser,
}) => {
  // Arrange: the old settings in Player1's browser, nothing imported yet.
  const first = await openPlayer(browser, "Player1");
  open = [first];
  await first.page.evaluate((old) => {
    for (const [key, value] of Object.entries(old))
      localStorage.setItem(`avclient-livekit.${key}`, JSON.stringify(value));
    for (const id of [
      "modular-av",
      "modular-av-dock",
      "modular-av-mic-denoise",
      "modular-av-cam-background",
    ])
      localStorage.removeItem(`${id}.legacyImported`);
  }, OLD);

  // Act: Foundry loads again in that browser.
  const tab = await openSecondTab(first);
  open = [tab, first];

  // Assert
  await expect
    .poll(
      () =>
        tab.run(
          (api, game) => ({
            sensitivity: api.state.get().local.inputSensitivity,
            effects: game.settings.get("modular-av", "effects"),
            layout: game.settings.get("modular-av-dock", "tileLayout"),
            strength: game.settings.get(
              "modular-av-cam-background",
              "blurStrength",
            ),
          }),
          null,
        ),
      { timeout: 30_000 },
    )
    .toEqual({
      sensitivity: { auto: false, threshold: -42 },
      effects: expect.arrayContaining(["rnnoise", "background-blur"]),
      layout: "focus",
      strength: 0.3,
    });
});
