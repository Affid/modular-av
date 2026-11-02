// The audio mixer in the local Foundry world: a player opens it from the dock,
// sets up their voice, and it stays; the window passes axe's WCAG 2.1 AA checks.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, test } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  openGm,
  openPlayer,
  type Player,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

const AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const EFFECT_MODULES = [
  "modular-av-mic-denoise",
  "modular-av-audio-reverb",
  "modular-av-audio-echo",
  "modular-av-audio-eq",
  "modular-av-livekit-krisp",
];

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "p2p", "dock");
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

async function openFromSettings(player: Player): Promise<Locator> {
  await expect(player.page.locator("#camera-views .mav-dock")).toBeVisible();
  await player.page.locator(".mav-dock-settings").click();
  const settings = player.page.locator("#modular-av-settings");
  await settings.locator('[data-tab="voice"]').click();
  await settings.getByRole("button", { name: "Audio mixer" }).click();
  const mixer = player.page.locator("#modular-av-audio-mixer");
  await expect(mixer.locator(".mav-mixer")).toBeVisible();
  return mixer;
}

const clearPipeline = (player: Player): Promise<void> =>
  player.run(async (api) => {
    await api.commands.setEffectEnabled("reverb", false);
    await api.commands.setAudioPipeline({
      places: { reverb: "send" },
      mix: { reverb: 0.3 },
      channelLevel: 1,
    });
  }, null);

test("a player sets up their voice in the mixer, and it stays", async ({
  browser,
}) => {
  // Arrange
  const p1 = track(await openPlayer(browser, "Player1"));
  await clearPipeline(p1);
  const mixer = await openFromSettings(p1);
  const reverb = mixer.locator('[data-effect="reverb"]');

  // Act: turn it on, move it ahead of the gate, then turn its level down.
  await reverb.locator('[data-field="on.reverb"]').check();
  await expect
    .poll(async () => (await p1.state()).local.chosenEffects)
    .toContain("reverb");
  await reverb.locator('[data-field="place.reverb"]').selectOption("pre-gate");

  // Assert: it moved, and the window says what that does.
  await expect(
    mixer.locator('[data-part="pre-gate"] [data-effect="reverb"]'),
  ).toBeVisible();
  await expect(
    mixer.locator('[data-warning="tail-before-gate"]'),
  ).toContainText("Reverb");
  await expect(
    mixer.locator('[data-control="modular-av-audio-reverb.decay"]'),
  ).toBeVisible();

  // Act: back on a send, with its own level.
  await mixer
    .locator('[data-effect="reverb"] [data-field="place.reverb"]')
    .selectOption("send");
  const level = mixer.locator('[data-field="mix.reverb"]');
  await level.fill("55");

  // Assert: it stays across a reload.
  await expect
    .poll(async () => (await p1.state()).local.audioEffectMix.reverb)
    .toBe(0.55);
  await p1.page.reload();
  await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
  await expect
    .poll(async () => {
      const { local } = await p1.state();
      return [local.chosenEffects, local.audioEffectMix.reverb];
    })
    .toEqual([["reverb"], 0.55]);
  await clearPipeline(p1);
});

test("Test my voice records what is sent and plays it back", async ({
  browser,
}) => {
  // Arrange
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  for (const player of [gm, p1]) await expectStatus(player, "connected");
  const mixer = await openFromSettings(p1);
  const status = mixer.locator('[data-field="voiceTestStatus"]');

  // Act
  await mixer.locator('[data-field="voiceTest"]').click();

  // Assert
  await expect(status).toHaveText("Recording, speak now…");
  await expect(status).toHaveText("Playing it back…", { timeout: 10_000 });
  await expect(status).toHaveText("", { timeout: 15_000 });
  expect(p1.notices).toEqual([]);
});

test("the mixer passes axe's checks", async ({ browser }) => {
  const p1 = track(await openPlayer(browser, "Player1"));
  await p1.run(async (api) => {
    await api.commands.setEffectEnabled("reverb", true);
  }, null);
  await openFromSettings(p1);

  const results = await new AxeBuilder({ page: p1.page })
    .include("#modular-av-audio-mixer")
    .withTags(AA)
    .analyze();
  await clearPipeline(p1);

  expect(results.violations).toEqual([]);
});

test("with no effect module the mixer says they exist", async ({ browser }) => {
  // Arrange
  const gm = track(await openGm(browser));
  const setModules = (on: boolean): Promise<void> =>
    gm.run(
      async (_api, game, change) => {
        const now = game.settings.get("core", "moduleConfiguration") as object;
        await game.settings.set("core", "moduleConfiguration", {
          ...now,
          ...Object.fromEntries(change.ids.map((id) => [id, change.on])),
        });
      },
      { ids: EFFECT_MODULES, on },
    );
  await setModules(false);

  try {
    // Act
    const p1 = track(await openPlayer(browser, "Player1"));
    const mixer = await openFromSettings(p1);

    // Assert
    await expect(mixer).toContainText("modules of their own");
    await expect(mixer.locator("[data-effect]")).toHaveCount(0);
    await p1.close();
    open = open.filter((p) => p !== p1);
  } finally {
    await setModules(true);
  }
});
