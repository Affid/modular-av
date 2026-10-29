/**
 * The UI contract (handoff §3): what every UI module must show and let the
 * player do, checked in a real browser with the core and the mock service.
 * A UI module runs it from a Playwright spec with a small driver.
 *
 * What a UI must expose, whatever it looks like:
 * - each participant shown in an element with `data-participant-id`,
 *   carrying `data-speaking`, `data-muted`, `data-deafened`,
 *   `data-blocked-audio` and `data-blocked-video` while they hold;
 * - each state shown as a visible element with `data-indicator` (its name)
 *   and an accessible name, inside the participant's element, or among the
 *   local player's warnings: muted, deafened, blocked-audio, blocked-video,
 *   connection, open-mic, microphone-held, effect-failed;
 * - the session's status in a visible element with `data-status` (idle,
 *   connecting, connected, waiting, reconnecting, ended) and text;
 * - every command reachable by mouse and keyboard;
 * - other modules' contributions, by their labels.
 */
import type { AVState, ModularAV } from "@modular-av/api";
import { expect, type Locator, type Page, test } from "@playwright/test";
import type {} from "../harness/types.ts";
import { SAMPLE } from "../harness/sample-plugin.ts";

export type Control =
  "mute" | "deafen" | "camera" | "leave" | "action" | "settings" | "quick";

export interface UIDriver {
  /** The package directory of the UI module (the harness's ?module=). */
  readonly module: string;
  /** The module id that asks for the Picture-in-Picture window. */
  readonly moduleId: string;
  /** A layout or mode the contract runs in, named in the test titles. */
  readonly variant?: string;
  /** Puts the UI in that layout once the call is up. */
  prepare?(page: Page): Promise<void>;
  /** The local player's control. */
  control(page: Page, control: Control): Locator;
  /** Where the local player's warnings show. */
  warnings(page: Page): Locator;
  /** Opens a participant's menu; resolves with it. */
  openMenu(page: Page, participant: string): Promise<Locator>;
  /** Opens the quick controls; resolves with them. */
  openQuickControls(page: Page): Promise<Locator>;
  /** Opens the connection details of a participant's menu. */
  openConnectionDetails(page: Page, menu: Locator): Promise<Locator>;
  /** Puts the cameras in the Picture-in-Picture window, from a click. */
  openWindow(page: Page): Promise<void>;
  /**
   * In an open settings window with tabs, shows the sections that name no
   * tab (as the sample's doesn't).
   */
  showUntabbedSettings?(page: Page): Promise<void>;
}

const PLAYERS = ["p1", "p2"] as const;

async function open(page: Page, driver: UIDriver, extra = ""): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/?module=${driver.module}&service=mock&effects=test&sample=1&players=${PLAYERS.join(",")}${extra}`,
  );
  await page.waitForFunction(() => window.harness !== undefined);
  expect(errors).toEqual([]);
  await expect(page.locator("[data-status]").first()).toHaveAttribute(
    "data-status",
    "connected",
    { timeout: 20_000 },
  );
  for (const id of PLAYERS)
    await expect(participant(page, id)).toBeVisible({ timeout: 20_000 });
  await driver.prepare?.(page);
}

const participant = (page: Page, id: string): Locator =>
  page.locator(`[data-participant-id="${id}"]`).first();

const indicator = (scope: Locator, name: string): Locator =>
  scope.locator(`[data-indicator="${name}"]`).first();

/** Runs `run` with a player's (or the page's own, "gm1") core API. */
async function as(
  page: Page,
  player: string,
  run: string,
  args: readonly unknown[] = [],
): Promise<void> {
  await page.evaluate(
    async ({ player, run, args }) => {
      const harness = window.harness;
      const api =
        player === "gm1"
          ? (harness?.client.game.modules.get("modular-av")?.api as ModularAV)
          : harness?.ui?.players[player];
      if (!api) throw new Error(`no core for ${player}`);
      const [group, name] = run.split(".");
      const target = (
        api as unknown as Record<
          string,
          Record<string, (...a: unknown[]) => unknown>
        >
      )[group ?? ""];
      await target?.[name ?? ""]?.(...args);
    },
    { player, run, args },
  );
}

const hub = (
  page: Page,
  method: string,
  args: readonly unknown[],
): Promise<void> =>
  page.evaluate(
    ({ method, args }) => {
      const target = window.harness?.ui?.hub as unknown as Record<
        string,
        (...a: unknown[]) => void
      >;
      target[method]?.(...args);
    },
    { method, args },
  );

const local = (page: Page): Promise<AVState> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")
      ?.api as ModularAV;
    return api.state.get();
  });

/** The composite widget (toolbar, menu, list) a control sits in, if any. */
const GROUP = '[role="toolbar"], [role="menu"], [role="list"], ol, ul';

const focused = (target: Locator): Promise<boolean> =>
  target.evaluate((el) => el === el.ownerDocument.activeElement);

/**
 * Reaches `target` by keyboard: Tab to it, or Tab into its group (an ARIA
 * toolbar has one tab stop) and then the arrow keys. Fails if it can't.
 */
async function tabTo(page: Page, target: Locator): Promise<void> {
  await page.locator("body").focus();
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    if (await focused(target)) return;
    const inGroup = await target.evaluate((el, group) => {
      const active = el.ownerDocument.activeElement;
      const own = el.closest(group);
      return own !== null && active !== null && own.contains(active);
    }, GROUP);
    if (!inGroup) continue;
    for (let j = 0; j < 20; j += 1) {
      await page.keyboard.press("ArrowRight");
      if (await focused(target)) return;
    }
  }
  throw new Error("The control can't be reached by keyboard");
}

/** A visible indicator with an accessible name. */
async function expectShown(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  expect(await target.getAttribute("aria-label")).toBeTruthy();
}

function stateTests(driver: UIDriver): void {
  test("shows every player in the call by name", async ({ page }) => {
    await open(page, driver);

    for (const id of PLAYERS)
      await expect(participant(page, id)).toContainText(`Player ${id}`);
  });

  test("shows others muted, deafened and speaking", async ({ page }) => {
    await open(page, driver);

    await as(page, "p1", "commands.setMuted", [true]);
    await as(page, "p1", "commands.setDeafened", [true]);
    await hub(page, "setSpeaking", ["p1", true]);

    const tile = participant(page, "p1");
    await expect(tile).toHaveAttribute("data-muted", "");
    await expect(tile).toHaveAttribute("data-deafened", "");
    await expect(tile).toHaveAttribute("data-speaking", "");
    await expectShown(indicator(tile, "muted"));
    await expectShown(indicator(tile, "deafened"));
  });

  test("shows a GM's blocks", async ({ page }) => {
    await open(page, driver);

    await as(page, "gm1", "commands.setBroadcastPermissions", [
      "p2",
      { audio: false, video: false },
    ]);

    const tile = participant(page, "p2");
    await expect(tile).toHaveAttribute("data-blocked-audio", "");
    await expectShown(indicator(tile, "blocked-audio"));
    await expectShown(indicator(tile, "blocked-video"));
  });

  test("shows the connection: a poor link, then reconnecting", async ({
    page,
  }) => {
    await open(page, driver);

    await hub(page, "setQuality", ["gm1", "p1", "poor"]);
    await expectShown(indicator(participant(page, "p1"), "connection"));
    await hub(page, "loseConnection", ["gm1"]);

    const status = page.locator("[data-status]").first();
    await expect(status).toHaveAttribute("data-status", "reconnecting");
    await expect(status).toBeVisible();
    expect((await status.textContent())?.trim()).toBeTruthy();
  });

  test("shows open mic when voice activity can't run", async ({ page }) => {
    await open(page, driver, "&gate=broken");

    await as(page, "gm1", "commands.setVoiceMode", ["activity"]);

    await expectShown(indicator(driver.warnings(page), "open-mic"));
  });

  test("shows the microphone held off when the player chose that over an open mic", async ({
    page,
  }) => {
    await open(page, driver, "&gate=broken");

    await as(page, "gm1", "commands.setGateFallback", ["mute"]);
    await as(page, "gm1", "commands.setVoiceMode", ["activity"]);

    await expectShown(indicator(driver.warnings(page), "microphone-held"));
    await expect(indicator(driver.warnings(page), "open-mic")).toHaveCount(0);
  });

  test("shows an effect that failed", async ({ page }) => {
    await open(page, driver);

    await as(page, "gm1", "commands.setEffectEnabled", ["test-fail", true]);

    await expectShown(indicator(driver.warnings(page), "effect-failed"));
  });
}

function commandTests(driver: UIDriver): void {
  for (const [control, read] of [
    ["mute", (s: AVState) => s.local.muted],
    ["deafen", (s: AVState) => s.local.deafened],
    ["camera", (s: AVState) => s.local.videoEnabled],
  ] as const)
    test(`${control}: by mouse, then back by keyboard`, async ({ page }) => {
      await open(page, driver);
      const before = read(await local(page));

      await driver.control(page, control).click();
      await expect.poll(async () => read(await local(page))).toBe(!before);
      await tabTo(page, driver.control(page, control));
      await page.keyboard.press("Enter");

      await expect.poll(async () => read(await local(page))).toBe(before);
    });

  test("leave and rejoin, by keyboard", async ({ page }) => {
    await open(page, driver);

    await tabTo(page, driver.control(page, "leave"));
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await local(page)).session.status)
      .toBe("left");
    await tabTo(page, driver.control(page, "action"));
    await page.keyboard.press("Enter");

    await expect
      .poll(async () => (await local(page)).session.status)
      .toBe("connected");
  });

  test("a participant's menu sets their volume", async ({ page }) => {
    await open(page, driver);

    const menu = await driver.openMenu(page, "p1");
    await menu.getByRole("slider").first().fill("40");

    await expect
      .poll(async () => (await local(page)).participants.p1?.volume)
      .toBeCloseTo(0.4);
  });
}

const calls = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => window.harness?.sample?.calls ?? []);

function contributionTests(driver: UIDriver): void {
  test("renders a plugin's quick controls and runs them", async ({ page }) => {
    await open(page, driver);

    const quick = await driver.openQuickControls(page);
    await quick.getByRole("switch", { name: /Sample toggle/ }).click();
    await expect(quick.getByLabel("Sample strength")).toBeVisible();
    await quick.getByLabel("Sample choice").selectOption("b");
    await quick.getByRole("button", { name: /Sample button/ }).click();

    await expect
      .poll(() => calls(page))
      .toEqual(["toggle:true", "choice:b", "button"]);
  });

  test("renders a plugin's participant action, indicator and status row", async ({
    page,
  }) => {
    await open(page, driver);

    await page.evaluate(() => {
      window.harness?.sample?.setIndicated(["p2"]);
    });
    await expect(
      participant(page, "p2").getByRole("img", { name: "Sample on" }),
    ).toBeVisible();
    const menu = await driver.openMenu(page, "p1");
    await menu.getByRole("button", { name: "Sample action" }).click();
    await expect.poll(() => calls(page)).toContain("action:p1");
    const own = await driver.openMenu(page, "gm1");
    const details = await driver.openConnectionDetails(page, own);

    await expect(details).toContainText("Sample region value");
  });

  test("renders a plugin's settings section in the settings window", async ({
    page,
  }) => {
    await open(page, driver);

    await driver.control(page, "settings").click();
    await driver.showUntabbedSettings?.(page);

    const section = page.getByRole("heading", { name: "Sample settings" });
    await expect(section).toBeVisible();
    await expect(page.getByLabel("Sample level")).toBeVisible();
  });
}

function windowTests(driver: UIDriver): void {
  test("moves the cameras into the Picture-in-Picture window and back", async ({
    page,
  }) => {
    await open(page, driver);

    await driver.openWindow(page);

    await expect
      .poll(() =>
        page.evaluate((owner) => {
          const api = window.harness?.client.game.modules.get("modular-av")
            ?.api as ModularAV;
          const pip = api.windows.pip.current;
          return pip?.owner === owner
            ? pip.document.querySelectorAll("[data-participant-id]").length
            : -1;
        }, driver.moduleId),
      )
      .toBe(3);
    await page.evaluate(() => {
      const api = window.harness?.client.game.modules.get("modular-av")
        ?.api as ModularAV;
      api.windows.pip.current?.close();
    });
    await expect(participant(page, "p1")).toBeVisible();
  });
}

/** Every check of the UI contract, against one UI module. */
export function uiContract(driver: UIDriver): void {
  const variant = driver.variant ? ` (${driver.variant})` : "";
  test.describe(`UI contract: ${driver.module}${variant}`, () => {
    test.describe.configure({ mode: "parallel" });
    stateTests(driver);
    commandTests(driver);
    contributionTests(driver);
    windowTests(driver);
  });
}

export { SAMPLE };
