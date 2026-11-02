// The audio mixer in the local Foundry world: a player opens it from the dock,
// sets up their voice, and it stays; the window passes axe's WCAG 2.1 AA checks.
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Locator, test } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  FOUNDRY_URL,
  idOf,
  loudness,
  notifications,
  openGm,
  openPlayer,
  type Player,
  setVoiceMode,
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

/** A run that failed mid-cave would otherwise leave the world in it. */
async function clearTableLayer(browser: Browser): Promise<void> {
  const gm = await openGm(browser);
  await gm.run(async (_api, game) => {
    await game.settings.set("modular-av-audio-mixer", "tableLayer", "");
  }, null);
  await gm.close();
}

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "p2p", "dock");
  await clearTableLayer(browser);
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

/** Reverb and echo off and out of the chain, reverb back on a send. */
const clearPipeline = (player: Player): Promise<void> =>
  player.run(async (api) => {
    await api.commands.setEffectEnabled("reverb", false);
    await api.commands.setEffectEnabled("echo", false);
    await api.commands.setAudioPipeline({
      places: { reverb: "send", echo: "send" },
      order: { "pre-gate": [], "post-gate": [], send: [] },
      mix: { reverb: 0.3 },
      channelLevel: 1,
    });
  }, null);

/** Adds `effect` from the browser of `place`'s "+". */
async function addFromBrowser(
  mixer: Locator,
  place: string,
  effect: string,
): Promise<void> {
  await mixer.locator(`[data-field="add.${place}"]`).click();
  await mixer.locator(`[data-pop="browser"] [data-offer="${effect}"]`).click();
  await expect(mixer.locator(`[data-key="${effect}"]`)).toBeVisible();
}

test("a player builds their chain in the mixer, and it stays", async ({
  browser,
}) => {
  // Arrange
  const p1 = track(await openPlayer(browser, "Player1"));
  await clearPipeline(p1);
  const mixer = await openFromSettings(p1);
  await expect(mixer.locator('[data-key="reverb"]')).toHaveCount(0);

  // Act: add it from a send's "+", then move it ahead of the gate.
  await addFromBrowser(mixer, "send", "reverb");
  await expect
    .poll(async () => (await p1.state()).local.chosenEffects)
    .toContain("reverb");
  await mixer.locator('[data-field="settings.reverb"]').click();
  await mixer.locator('[data-field="place.reverb"]').selectOption("pre-gate");

  // Assert: it moved, and the window says what that does.
  await expect(
    mixer.locator('[data-part="pre-gate"] [data-key="reverb"]'),
  ).toBeVisible();
  await expect(
    mixer.locator('[data-warning="tail-before-gate"]'),
  ).toContainText("Reverb");
  await expect(
    mixer.locator('[data-control="modular-av-audio-reverb.decay"]'),
  ).toBeVisible();

  // Act: dragged back onto the sends, with its own level.
  await p1.page.keyboard.press("Escape");
  await mixer
    .locator('[data-key="reverb"]')
    .dragTo(mixer.locator('[data-part="send"]'));
  await expect(
    mixer.locator('[data-part="send"] [data-key="reverb"]'),
  ).toBeVisible();
  await mixer.locator('[data-field="mix.reverb"]').fill("55");

  // Switched off, it keeps its card.
  await mixer.locator('[data-field="on.reverb"]').click();
  await expect(mixer.locator('[data-key="reverb"]')).toHaveAttribute(
    "data-state",
    "off",
  );
  await mixer.locator('[data-field="on.reverb"]').click();
  await expect
    .poll(async () => (await p1.state()).local.chosenEffects)
    .toContain("reverb");

  // Assert: it stays across a reload.
  await expect
    .poll(async () => (await p1.state()).local.audioEffectMix.reverb)
    .toBe(0.55);
  await p1.page.reload();
  await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
  await expect
    .poll(async () => {
      const { local } = await p1.state();
      return [
        local.chosenEffects,
        local.audioEffectPlaces.reverb,
        local.audioEffectMix.reverb,
      ];
    })
    .toEqual([["reverb"], "send", 0.55]);
  await clearPipeline(p1);
});

test("a preset comes back across a reload, in a call or out of one", async ({
  browser,
}) => {
  // Arrange: no call for this player's first steps.
  const p1 = track(await openPlayer(browser, "Player1"));
  await clearPipeline(p1);
  const mixer = await openFromSettings(p1);
  await addFromBrowser(mixer, "send", "echo");
  await expect
    .poll(async () => (await p1.state()).local.chosenEffects)
    .toContain("echo");

  // Act: save it, change everything it holds, reload, apply it.
  await mixer.locator('[data-field="presetName"]').fill("Canyon");
  await mixer.locator('[data-field="presetSave"]').click();
  await expect(mixer.locator('[data-field="preset"]')).toContainText("Canyon");
  await mixer.locator('[data-field="on.echo"]').click();
  await addFromBrowser(mixer, "send", "reverb");
  await expect(mixer.locator('[data-field="presetChanged"]')).toContainText(
    "Changed",
  );
  await p1.page.reload();
  await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
  const again = await openFromSettings(p1);
  await again
    .locator('[data-field="preset"]')
    .selectOption({ label: "Canyon" });

  // Assert: the switch and the chain are what was saved, by a macro too.
  await expect
    .poll(async () => (await p1.state()).local.chosenEffects)
    .toEqual(["echo"]);
  await expect(again.locator('[data-key="reverb"]')).toHaveCount(0);
  await expect(again.locator('[data-field="presetChanged"]')).toHaveText("");
  const names = await p1.run(
    (_api, game) =>
      (
        game as unknown as {
          modules: {
            get(id: string): {
              api: { presets: { list(): Promise<string[]> } };
            };
          };
        }
      ).modules
        .get("modular-av-audio-mixer")
        .api.presets.list(),
    null,
  );
  expect(names).toContain("Canyon");

  // Deleting asks first.
  await again.locator('[data-field="presetDelete"]').click();
  await p1.page.locator(".dialog button[data-action='yes']").click();
  await expect(again.locator('[data-field="preset"]')).not.toContainText(
    "Canyon",
  );
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

test("a muted player hears their voice in a test, and the table hears nothing", async ({
  browser,
}) => {
  // Arrange: the GM hears Player1 before the mute.
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  for (const player of [gm, p1]) await expectStatus(player, "connected");
  await setVoiceMode(p1, "always");
  const p1Id = await idOf(gm, "Player1");
  await expect
    .poll(async () => (await gm.state()).participants[p1Id]?.connected, {
      timeout: 60_000,
    })
    .toBe(true);
  await expect.poll(() => loudness(gm, p1Id)).toBeGreaterThan(-60);
  await p1.run((api) => api.commands.setMuted(true), null);
  await expect.poll(() => loudness(gm, p1Id)).toBeLessThan(-60);

  // Act: 4 s of the test's copy, while the GM listens.
  const [copy, heard] = await Promise.all([
    p1.run(async (api) => {
      const stream = api.preview.voice();
      if (!stream) return -100;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      const end = performance.now() + 4000;
      while (performance.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      }
      for (const t of stream.getTracks()) t.stop();
      await context.close();
      return peak > 0 ? 20 * Math.log10(peak) : -100;
    }, null),
    loudness(gm, p1Id),
  ]);

  // Assert
  expect(copy).toBeGreaterThan(-60);
  expect(heard).toBeLessThan(-60);
  await p1.run((api) => api.commands.setMuted(false), null);
});

test("a GM sees what a player runs, as it changes", async ({ browser }) => {
  // Arrange
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  const p1Id = await idOf(gm, "Player1");
  await clearPipeline(p1);

  // Act
  const mixer = await openFromSettings(gm);
  await mixer.locator('[data-tab="table"]').click();
  const row = mixer.locator(`[data-player="${p1Id}"]`);
  await expect(row.locator('[data-place="send"]')).toHaveText("");
  await p1.run(async (api) => {
    await api.commands.setEffectEnabled("reverb", true);
    await api.commands.setAudioEffectPlace("reverb", "pre-gate");
  }, null);

  // Assert
  await expect(row.locator('[data-place="pre-gate"]')).toContainText("Reverb");
  await expect(row).toContainText("rings on ahead of the voice gate");
  await clearPipeline(p1);
  await expect(row.locator('[data-place="send"]')).toHaveText("");

  const results = await new AxeBuilder({ page: gm.page })
    .include("#modular-av-audio-mixer")
    .withTags(AA)
    .analyze();
  expect(results.violations).toEqual([]);
});

interface MixerMacros {
  readonly layers: {
    set(layer: object, options?: object): Promise<void>;
    end(options?: object): Promise<void>;
  };
}

interface WithMacros {
  readonly modules: { get(id: string): { api: MixerMacros } };
}

const CAVE = {
  label: "Cave",
  effects: {
    reverb: { on: true, place: "send", mix: 0.6 },
    echo: { mix: 0.9 },
  },
};

const enterCave = (gm: Player): Promise<void> =>
  gm.run(
    (_api, game, layer) =>
      (game as unknown as WithMacros).modules
        .get("modular-av-audio-mixer")
        .api.layers.set(layer),
    CAVE,
  );

const leaveCave = (gm: Player): Promise<void> =>
  gm.run(
    (_api, game) =>
      (game as unknown as WithMacros).modules
        .get("modular-av-audio-mixer")
        .api.layers.end(),
    null,
  );

/** Player1's own setup: an echo at 20%, no reverb. */
async function ownSetup(p1: Player): Promise<void> {
  await clearPipeline(p1);
  await p1.run(async (api) => {
    await api.commands.setEffectEnabled("echo", true);
    await api.commands.setAudioEffectMix("echo", 0.2);
  }, null);
}

const pipelineOf = async (player: Player) => {
  const { local } = await player.state();
  return {
    chosen: [...local.chosenEffects].sort(),
    reverb: local.audioEffectMix.reverb,
    echo: local.audioEffectMix.echo,
  };
};

const OWN = { chosen: ["echo"], reverb: 0.3, echo: 0.2 };
const IN_CAVE = { chosen: ["echo", "reverb"], reverb: 0.6, echo: 0.9 };

test("a GM's cave applies at once, survives a reload and undoes exactly", async ({
  browser,
}) => {
  // Arrange
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await ownSetup(p1);
  await expect.poll(() => pipelineOf(p1)).toEqual(OWN);

  // Act: into the cave.
  await enterCave(gm);

  // Assert: it applied, and the player was told.
  await expect.poll(() => pipelineOf(p1)).toEqual(IN_CAVE);
  await expect
    .poll(() => notifications(p1))
    .toContainEqual(expect.stringContaining("Cave"));

  // Held controls are locked, and say who set them.
  const mixer = await openFromSettings(p1);
  await expect(mixer.locator('[data-field="mix.reverb"]')).toBeDisabled();
  await expect(mixer.locator('[data-key="reverb"]')).toContainText("GM: ");

  // Act: a reload mid-cave lands in the same place, with no second notice.
  await p1.page.reload();
  await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
  await expect.poll(() => pipelineOf(p1)).toEqual(IN_CAVE);

  // Act: out of the cave.
  await leaveCave(gm);

  // Assert: exactly what it was.
  await expect.poll(() => pipelineOf(p1)).toEqual(OWN);
  await clearPipeline(p1);
});

test("a player refuses one layer, and the GM sees it", async ({ browser }) => {
  // Arrange
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  const p1Id = await idOf(gm, "Player1");
  await ownSetup(p1);
  const table = await openFromSettings(gm);
  await table.locator('[data-tab="table"]').click();
  await enterCave(gm);
  await expect.poll(() => pipelineOf(p1)).toEqual(IN_CAVE);

  // Act
  const mixer = await openFromSettings(p1);
  await mixer.getByRole("button", { name: "Not for me" }).click();

  // Assert
  await expect.poll(() => pipelineOf(p1)).toEqual(OWN);
  await expect(table.locator(`[data-player="${p1Id}"]`)).toContainText(
    "Cave: refused",
  );

  // The next layer applies again.
  await leaveCave(gm);
  await enterCave(gm);
  await expect.poll(() => pipelineOf(p1)).toEqual(IN_CAVE);
  await leaveCave(gm);
  await expect.poll(() => pipelineOf(p1)).toEqual(OWN);
  await clearPipeline(p1);
});

test("a player away gets the layer on joining, and loses it the same way", async ({
  browser,
}) => {
  // Arrange: their own browser keeps their setup while they are away.
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  await ownSetup(p1);
  const leave = () => p1.page.goto("about:blank");
  const join = async () => {
    await p1.page.goto(`${FOUNDRY_URL}/game`);
    await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
  };

  // Act: into the cave while Player1 is away.
  await leave();
  await enterCave(gm);
  await join();

  // Assert
  await expect.poll(() => pipelineOf(p1)).toEqual(IN_CAVE);

  // Act: out of it while they are away.
  await leave();
  await leaveCave(gm);
  await join();

  // Assert
  await expect.poll(() => pipelineOf(p1)).toEqual(OWN);
  await clearPipeline(p1);
});

test("a GM applies a preset to one player from the table", async ({
  browser,
}) => {
  // Arrange
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  const p1Id = await idOf(gm, "Player1");
  await ownSetup(p1);
  await clearPipeline(gm);
  const table = await openFromSettings(gm);
  await gm.run(async (api) => {
    await api.commands.setEffectEnabled("reverb", true);
    await api.commands.setAudioEffectMix("reverb", 0.6);
  }, null);
  await table.locator('[data-field="presetName"]').fill("Orc voice");
  await table.locator('[data-field="presetSave"]').click();
  await expect(table.locator('[data-field="preset"]')).toContainText("Orc");
  await table.locator('[data-tab="table"]').click();

  // Act
  await table.locator('[data-field="layerTarget"]').selectOption(p1Id);
  await table.locator('[data-field="layerApply"]').click();

  // Assert
  await expect
    .poll(async () => (await pipelineOf(p1)).chosen)
    .toEqual(["echo", "reverb"]);

  // Act, Assert
  await table.locator(`[data-field="layerEnd.${p1Id}"]`).click();
  await expect
    .poll(async () => (await pipelineOf(p1)).chosen)
    .toEqual(["echo"]);
  await table.locator('[data-tab="mine"]').click();
  await table.locator('[data-field="presetDelete"]').click();
  await gm.page.locator(".dialog button[data-action='yes']").click();
  await clearPipeline(gm);
  await clearPipeline(p1);
});

test("the mixer passes axe's checks, pop-ups open too", async ({ browser }) => {
  // Arrange: a chain with a card on, one kept off, and a send.
  const p1 = track(await openPlayer(browser, "Player1"));
  await p1.run(async (api) => {
    await api.commands.setAudioPipeline({
      order: { "pre-gate": ["eq"], "post-gate": [], send: ["reverb"] },
    });
    await api.commands.setEffectEnabled("reverb", true);
  }, null);
  const mixer = await openFromSettings(p1);
  const check = async (): Promise<unknown[]> =>
    (
      await new AxeBuilder({ page: p1.page })
        .include("#modular-av-audio-mixer")
        .withTags(AA)
        .analyze()
    ).violations;

  // Act
  const window = await check();
  await mixer.locator('[data-field="settings.reverb"]').click();
  const settings = await check();
  await p1.page.keyboard.press("Escape");
  await mixer.locator('[data-field="add.post-gate"]').click();
  const browserPop = await check();
  await p1.page.keyboard.press("Escape");
  await clearPipeline(p1);
  await p1.run(
    (api) =>
      api.commands.setAudioPipeline({
        order: { "pre-gate": [], "post-gate": [], send: [] },
      }),
    null,
  );

  // Assert
  expect({ window, settings, browserPop }).toEqual({
    window: [],
    settings: [],
    browserPop: [],
  });
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
