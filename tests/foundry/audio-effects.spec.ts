// The effect modules in the local Foundry world: what a send adds reaches the
// other players, on LiveKit and on P2P.
import { expect, test } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  idOf,
  loudness,
  openGm,
  openPlayer,
  type Player,
  setVoiceMode,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

/** On P2P the two find each other at once or after about 28 s. */
const LINK_MS = 60_000;

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

async function call(
  browser: Parameters<typeof openGm>[0],
): Promise<{ gm: Player; p1: Player; p1Id: string }> {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  for (const player of [gm, p1]) await expectStatus(player, "connected");
  await setVoiceMode(p1, "always");
  const p1Id = await idOf(gm, "Player1");
  // Each is connected to the call well before they are to each other.
  await expect
    .poll(async () => (await gm.state()).participants[p1Id]?.connected, {
      timeout: LINK_MS,
    })
    .toBe(true);
  return { gm, p1, p1Id };
}

const setEffect = (player: Player, id: string): Promise<void> =>
  player.run(
    (api, _game, effect) => api.commands.setEffectEnabled(effect, true),
    id,
  );

/** Turns `id` on, with Channel level 0: the listener hears only what it adds. */
async function hearOnlyTheEffect(
  { gm, p1, p1Id }: { gm: Player; p1: Player; p1Id: string },
  id: string,
): Promise<void> {
  await p1.run(async (api, _game, effect) => {
    await api.commands.setEffectEnabled(effect, true);
    await api.commands.setAudioPipeline({ channelLevel: 0 });
  }, id);
  await expect
    .poll(async () => (await p1.state()).local.effects[id]?.status, {
      timeout: 30_000,
    })
    .toBe("running");
  await expect
    .poll(() => loudness(gm, p1Id), { timeout: 30_000 })
    .toBeGreaterThan(-60);
  expect([...gm.notices, ...p1.notices]).toEqual([]);
}

for (const service of ["livekit", "p2p"] as const)
  test.describe(`with ${service}`, () => {
    test.beforeAll(async ({ browser }) => {
      await configureWorld(browser, service, "dock");
    });

    for (const effect of ["reverb", "echo"])
      test(`a listener hears ${effect} on a send, with no dry voice`, async ({
        browser,
      }) => {
        await hearOnlyTheEffect(await call(browser), effect);
      });

    test("a player with the EQ on is still heard", async ({ browser }) => {
      // Arrange
      const { gm, p1, p1Id } = await call(browser);

      // Act
      await setEffect(p1, "eq");

      // Assert
      await expect
        .poll(async () => (await p1.state()).local.effects.eq?.status, {
          timeout: 30_000,
        })
        .toBe("running");
      await expect
        .poll(() => loudness(gm, p1Id), { timeout: 30_000 })
        .toBeGreaterThan(-60);
    });
  });
