// Milestone 6 end to end: noise cancellation in the local Foundry world
// with the dock, on LiveKit (and Krisp on LiveKit Cloud) and on P2P.
import { expect, test } from "@playwright/test";
import { usesCloud } from "../../scripts/services/livekit.ts";
import {
  configureWorld,
  expectStatus,
  idOf,
  openGm,
  openPlayer,
  type Player,
  setVoiceMode,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

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

const effectStatus = async (
  player: Player,
  id: string,
): Promise<string | undefined> =>
  (await player.state()).local.effects[id]?.status;

const setEffect = (player: Player, id: string, on: boolean): Promise<void> =>
  player.run(
    (api, _game, args) => api.commands.setEffectEnabled(args.id, args.on),
    { id, on },
  );

/** The loudest `listener` hears `speaker` over 4 s, in dBFS, on their tile. */
const loudness = (listener: Player, speaker: string): Promise<number> =>
  listener.run(
    (api, _game, id) =>
      new Promise<number>((resolve) => {
        const tile = document.querySelector(
          `#camera-views .mav-dock-tile[data-participant-id="${id}"]`,
        );
        if (!tile) {
          resolve(-100);
          return;
        }
        let loudest = -100;
        const off = api.meters.subscribe(id, tile, ({ db }) => {
          loudest = Math.max(loudest, db);
        });
        setTimeout(() => {
          off();
          resolve(loudest);
        }, 4000);
      }),
    speaker,
  );

/** A GM and Player1 in a call, Player1 always sending. */
async function call(
  browser: Parameters<typeof openGm>[0],
): Promise<{ gm: Player; p1: Player; p1Id: string }> {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  for (const player of [gm, p1]) await expectStatus(player, "connected");
  await setVoiceMode(p1, "always");
  return { gm, p1, p1Id: await idOf(gm, "Player1") };
}

async function expectHeardWith(
  model: string,
  { gm, p1, p1Id }: { gm: Player; p1: Player; p1Id: string },
): Promise<void> {
  await setEffect(p1, model, true);
  await expect
    .poll(() => effectStatus(p1, model), { timeout: 30_000 })
    .toBe("running");
  await expect
    .poll(() => loudness(gm, p1Id), { timeout: 30_000 })
    .toBeGreaterThan(-60);
  expect([...gm.notices, ...p1.notices]).toEqual([]);
}

test.describe("with LiveKit", () => {
  test.beforeAll(async ({ browser }) => {
    await configureWorld(browser, "livekit", "dock");
  });

  test("a player who turns RNNoise on is still heard", async ({ browser }) => {
    const players = await call(browser);

    await expectHeardWith("rnnoise", players);
  });

  test("Krisp is offered only on LiveKit Cloud, and runs there", async ({
    browser,
  }) => {
    const players = await call(browser);

    if (!usesCloud()) {
      expect(await effectStatus(players.p1, "krisp")).toBe("unavailable");
      return;
    }
    await expectHeardWith("krisp", players);
  });
});

test.describe("with P2P", () => {
  test.beforeAll(async ({ browser }) => {
    await configureWorld(browser, "p2p", "dock");
  });

  test("a player who turns GTCRN on is still heard, and Krisp isn't offered", async ({
    browser,
  }) => {
    const players = await call(browser);

    expect(await effectStatus(players.p1, "krisp")).toBe("unavailable");
    await expectHeardWith("gtcrn", players);
  });
});
