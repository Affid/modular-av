// First release: a GM who used LiveKit AVClient brings its server over,
// in the local Foundry world, with Foundry's own dialogs.
import { expect, test } from "@playwright/test";
import { configureWorld, openPlayer, type Player } from "./world.ts";

test.describe.configure({ mode: "serial" });

const LEGACY = "avclient-livekit.liveKitConnectionSettings";

let open: Player[] = [];

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  // The world as the other suites expect it: LiveKit's address back.
  await configureWorld(browser, "livekit", "foundry");
});

test("a GM brings LiveKit AVClient's server over, and its readable secret goes", async ({
  browser,
}) => {
  // Arrange: the old module's setting in the world, no server set here.
  const setup = await openPlayer(browser, "Gamemaster");
  open = [setup];
  await setup.run(async (_api, game, key) => {
    await game.settings.set("modular-av-livekit", "serverUrl", "");
    const world = (
      game.settings as unknown as {
        storage: {
          get(s: string): {
            filter(p: (s: { key: string }) => boolean): {
              delete(): Promise<unknown>;
            }[];
          };
        };
      }
    ).storage.get("world");
    await Promise.all(
      world.filter((s) => s.key === key).map((s) => s.delete()),
    );
    const Setting = (
      globalThis as unknown as {
        CONFIG: {
          Setting: {
            documentClass: { create(data: object): Promise<unknown> };
          };
        };
      }
    ).CONFIG.Setting.documentClass;
    await Setting.create({
      key,
      value: JSON.stringify({
        serverType: "custom",
        url: "table.livekit.cloud",
        username: "APIoldkey",
        password: "old-secret",
      }),
    });
  }, LEGACY);
  await setup.close();

  // Act: the GM opens the world again and accepts.
  const gm = await openPlayer(browser, "Gamemaster");
  open = [gm];
  await gm.page.locator('dialog [data-action="import"]').click();
  await gm.page.locator('dialog [data-action="yes"]').click();

  // Assert
  await expect
    .poll(() =>
      gm.run(
        (_api, game, key) => ({
          url: game.settings.get("modular-av-livekit", "serverUrl"),
          apiKey: game.settings.get("modular-av-livekit", "apiKey"),
          secret: game.settings.get("modular-av-livekit", "apiSecret"),
          old: (
            game.settings as unknown as {
              storage: { get(s: string): { getItem(k: string): unknown } };
            }
          ).storage
            .get("world")
            .getItem(key),
        }),
        LEGACY,
      ),
    )
    .toEqual({
      url: "wss://table.livekit.cloud",
      apiKey: "APIoldkey",
      secret: "old-secret",
      old: null,
    });
  expect(gm.messages.join("\n")).toContain("Create a new key and secret");
});
