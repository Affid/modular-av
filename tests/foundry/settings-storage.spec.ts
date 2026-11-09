// Issue #11 end to end: a player's settings follow them to another browser
// (a new browser context is a new device, as another address would be),
// through Foundry's user scope, and an old browser's value moves to them.
import { expect, test } from "@playwright/test";
import {
  configureWorld,
  FOUNDRY_URL,
  idOf,
  openPlayer,
  type Player,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

/** Removes the player's own saved values, so each run starts clean. */
const forget = (player: Player, keys: readonly string[]): Promise<void> =>
  player.run(async (_api, game, ids) => {
    const settings = game.settings as unknown as {
      storage: {
        get(scope: "user"): {
          getSetting(
            id: string,
            user: string,
          ): { delete(): Promise<unknown> } | undefined;
        };
      };
    };
    for (const id of ids)
      await settings.storage.get("user").getSetting(id, game.userId)?.delete();
  }, keys);

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "p2p");
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test("a player's voice settings and volumes follow them to another browser", async ({
  browser,
}) => {
  // Arrange
  const first = track(await openPlayer(browser, "Player3"));
  await forget(first, ["modular-av.audioCutTails", "modular-av.volumes"]);
  const other = await idOf(first, "Player2");

  // Act
  await first.run((api) => api.commands.setAudioCutTails(true), null);
  await first.run((api, _game, id) => api.commands.setVolume(id, 0.3), other);
  await first.close();
  open = [];
  const second = track(await openPlayer(browser, "Player3"));

  // Assert
  await expect
    .poll(async () => (await second.state()).local.audioCutTails)
    .toBe(true);
  // Player2 isn't online: their volume is in Foundry's own A/V settings.
  await expect
    .poll(() =>
      second.run(
        (_api, game, id) =>
          (
            game.webrtc as unknown as {
              settings: {
                client: {
                  users: Record<string, { volume?: number } | undefined>;
                };
              };
            }
          ).settings.client.users[id]?.volume,
        other,
      ),
    )
    .toBe(0.3);
  expect(second.notices).toEqual([]);
});

test("a browser's earlier value moves to the player once", async ({
  browser,
}) => {
  // Arrange: the player has nothing saved for the channel level.
  const setup = track(await openPlayer(browser, "Player3"));
  await forget(setup, ["modular-av.audioChannelLevel"]);
  await setup.close();
  open = [];

  // Act: a browser that kept 0.5 back when it was a device setting.
  const player = track(
    await openPlayer(browser, "Player3", {
      storageState: {
        cookies: [],
        origins: [
          {
            origin: FOUNDRY_URL,
            localStorage: [
              { name: "modular-av.audioChannelLevel", value: "0.5" },
            ],
          },
        ],
      },
    }),
  );

  // Assert
  await expect
    .poll(() =>
      player.run(
        (_api, game) =>
          (
            game.settings as unknown as {
              storage: {
                get(scope: "user"): {
                  getSetting(
                    id: string,
                    user: string,
                  ): { value: unknown } | undefined;
                };
              };
            }
          ).storage
            .get("user")
            .getSetting("modular-av.audioChannelLevel", game.userId)?.value,
        null,
      ),
    )
    .toBe(0.5);
  expect((await player.state()).local.audioChannelLevel).toBe(0.5);
});
