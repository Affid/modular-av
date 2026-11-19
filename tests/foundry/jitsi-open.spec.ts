// Issue #34 end to end: the core and modular-av-jitsi in the local Foundry
// world, joining docker-jitsi-meet as it sets itself up by default (open,
// no sign-in) by a room link (pnpm test:foundry).
import { expect, test } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  idOf,
  openGm,
  openPlayer,
  openSecondTab,
  type Player,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

/** A room nobody else uses; lower case, as Jitsi folds it. */
const ROOM = `modular-av-e2e-${crypto.randomUUID().slice(0, 8)}`;

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

/** "Name:connected:hasAudio:hasVideo" for each named player, as `viewer` sees them. */
async function seen(
  viewer: Player,
  names: readonly string[],
): Promise<string[]> {
  const { participants } = await viewer.state();
  const ids = await Promise.all(names.map((n) => idOf(viewer, n)));
  return ids.map((id) => {
    const p = participants[id];
    return p
      ? `${p.name}:${String(p.connected)}:${String(p.hasAudio)}:${String(p.hasVideo)}`
      : "missing";
  });
}

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "jitsi", "foundry", ROOM);
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit");
});

test("players join an open server with no GM online and see each other", async ({
  browser,
}) => {
  // Arrange / Act: no GM, so nobody could sign a token.
  const p1 = track(await openPlayer(browser, "Player1"));
  const p2 = track(await openPlayer(browser, "Player2"));

  // Assert
  for (const player of [p1, p2]) await expectStatus(player, "connected");
  await expect
    .poll(() => seen(p1, ["Player2"]))
    .toEqual(["Player2:true:true:true"]);
  await expect
    .poll(() => seen(p2, ["Player1"]))
    .toEqual(["Player1:true:true:true"]);
  expect([...p1.notices, ...p2.notices]).toEqual([]);
});

test("a second tab of the same player wins; the first stops for good", async ({
  browser,
}) => {
  const first = track(await openPlayer(browser, "Player1"));
  await expectStatus(first, "connected");

  const second = track(await openSecondTab(first));

  await expectStatus(second, "connected");
  await expect
    .poll(async () => (await first.state()).session)
    .toMatchObject({ status: "left", reason: "joined-elsewhere" });
});

test("the settings window hides the app id and secret while an open server is chosen", async ({
  browser,
}) => {
  const gm = track(await openGm(browser));

  const rows = await gm.page.evaluate(async () => {
    const sheet = (
      globalThis as unknown as {
        game: {
          settings: { sheet: { render(force: boolean): Promise<unknown> } };
        };
      }
    ).game.settings.sheet;
    await sheet.render(true);
    const row = (key: string): HTMLElement["hidden"] | undefined =>
      document
        .querySelector<HTMLInputElement>(
          `input[name="modular-av-jitsi.${key}"]`,
        )
        ?.closest<HTMLElement>(".form-group")?.hidden;
    const whileOpen = [row("appId"), row("appSecret")];
    const select = document.querySelector<HTMLSelectElement>(
      'select[name="modular-av-jitsi.access"]',
    );
    if (!select) return { whileOpen, forTokens: [] };
    select.value = "token";
    select.dispatchEvent(new Event("change"));
    return { whileOpen, forTokens: [row("appId"), row("appSecret")] };
  });

  expect(rows).toEqual({ whileOpen: [true, true], forTokens: [false, false] });
});

test("a GM's address without a room gets one, and loses a pasted token", async ({
  browser,
}) => {
  const gm = track(await openGm(browser));
  const saved = (): Promise<unknown> =>
    gm.page.evaluate(() =>
      (
        globalThis as unknown as {
          game: { settings: { get(n: string, k: string): unknown } };
        }
      ).game.settings.get("modular-av-jitsi", "serverUrl"),
    );
  const before = await saved();

  try {
    await gm.page.evaluate(async () => {
      await (
        globalThis as unknown as {
          game: {
            settings: {
              set(n: string, k: string, v: unknown): Promise<unknown>;
            };
          };
        }
      ).game.settings.set(
        "modular-av-jitsi",
        "serverUrl",
        "http://127.0.0.1:8001/?jwt=pasted",
      );
    });

    await expect
      .poll(saved)
      .toMatch(/^http:\/\/127\.0\.0\.1:8001\/[a-z2-7]{20}$/);
    await expect
      .poll(() =>
        gm.page.evaluate(() =>
          [...document.querySelectorAll("#notifications .notification")].map(
            (n) => n.textContent,
          ),
        ),
      )
      .toContainEqual(expect.stringMatching(/held a sign-in token/));
  } finally {
    await gm.page.evaluate(async (value) => {
      await (
        globalThis as unknown as {
          game: {
            settings: {
              set(n: string, k: string, v: unknown): Promise<unknown>;
            };
          };
        }
      ).game.settings.set("modular-av-jitsi", "serverUrl", value);
    }, before);
  }
});
