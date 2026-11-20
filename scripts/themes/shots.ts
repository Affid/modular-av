// Pictures of the dock under a theme, in the test harness: for trying a
// look before it is built (docs/making-a-theme.md). Trial stylesheets and
// pictures are laid over the theme as it is, so nothing in the repository
// has to change to see an idea.
//
//   node scripts/themes/shots.ts <folder for the pictures> [options]
//
// It starts the harness if it isn't running, and stops it again. Where
// Foundry is installed (FOUNDRY_APP_DIR) the page gets Foundry's own
// fonts, which the harness lacks.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import {
  OptionsError,
  parseShotArgs,
  PLACEMENTS,
  type Shot,
  type ShotOptions,
  shotsOf,
} from "../../tools/themes/options.ts";
import { loadFoundryEnv } from "../foundry/env.ts";

/** As in playwright.config.ts: IPv6 loopback, where an unused port is refused at once. */
const HARNESS = "http://[::1]:5174";
const WIDTH = 1280;
/** Round the dock, so its edge toward the scene shows. */
const MARGIN = 40;
/** For the theme's pictures and the fit to settle. */
const SETTLE_MS = 1_500;

const FONTS = join(loadFoundryEnv().appDir, "public", "fonts");
/** Foundry's text and heading faces, from its own files. */
const FONT_CSS = `
@font-face { font-family: "Signika"; src: url("/theme-shots/fonts/signika/signika-regular.woff2") format("woff2"); }
@font-face { font-family: "Signika"; font-weight: 700; src: url("/theme-shots/fonts/signika/signika-bold.woff2") format("woff2"); }
@font-face { font-family: "Modesto Condensed"; src: url("/theme-shots/fonts/modesto-condensed/modesto-condensed.woff2") format("woff2"); }
@font-face { font-family: "Modesto Condensed"; font-weight: 700; src: url("/theme-shots/fonts/modesto-condensed/modesto-condensed-bold.woff2") format("woff2"); }
:root { --font-body: "Signika", ui-sans-serif, sans-serif; --font-h1: "Modesto Condensed", serif; }`;
/** The harness's page has no height of its own (a docked dock would grow), and no scene. */
const PAGE_CSS = `#camera-views { height: 100vh }
body { margin: 0; background: #4a4f47 linear-gradient(120deg, #56604f, #3a3f3a) }`;

const answers = (): Promise<boolean> =>
  fetch(HARNESS).then(
    (response) => response.ok,
    () => false,
  );

/** The harness, started if it wasn't running: the process to stop afterwards, if any. */
async function harness(): Promise<ChildProcess | null> {
  if (await answers()) return null;
  const server = spawn(
    "pnpm",
    ["exec", "vite", "--config", "packages/testing/src/harness/vite.config.ts"],
    // A group of its own: stopping it must also stop the server pnpm starts.
    { stdio: "ignore", detached: true },
  );
  for (let tries = 0; tries < 60; tries += 1) {
    if (await answers()) return server;
    await new Promise((done) => setTimeout(done, 500));
  }
  stop(server);
  throw new Error(`The harness didn't answer at ${HARNESS}`);
}

/** Stops the harness this script started, with everything it started. */
function stop(server: ChildProcess): void {
  if (server.pid !== undefined) process.kill(-server.pid);
}

/** Serves trial pictures and Foundry's fonts to the page, under /theme-shots/. */
async function serveFiles(page: Page, art: string | null): Promise<void> {
  await page.route("**/theme-shots/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const [, kind = "", ...rest] = path.replace("/theme-shots", "").split("/");
    const root = kind === "fonts" ? FONTS : kind === "art" ? art : null;
    // One folder deep at most, and never out of it.
    const file = root && !rest.includes("..") ? join(root, ...rest) : null;
    return file && existsSync(file)
      ? route.fulfill({ path: file })
      : route.fulfill({ status: 404 });
  });
}

interface Told {
  readonly tile: number;
  readonly spare: string;
  readonly scrolls: boolean;
  readonly box: { x: number; y: number; width: number; height: number };
}

/** What the page says of the dock: for the log, and to cut the picture to it. */
const told = (page: Page): Promise<Told> =>
  page.evaluate(() => {
    const dock = document.querySelector(".mav-dock");
    const list = document.querySelector<HTMLElement>(".mav-dock-tiles");
    const tile = document.querySelector(".mav-dock-tile");
    const box = dock?.getBoundingClientRect();
    return {
      tile: Math.round(tile?.getBoundingClientRect().width ?? 0),
      spare: list?.style.getPropertyValue("--mav-dock-spare") ?? "",
      scrolls: list
        ? list.scrollHeight > list.clientHeight + 1 ||
          (getComputedStyle(list).overflowX !== "hidden" &&
            list.scrollWidth > list.clientWidth + 1)
        : false,
      box: {
        x: box?.x ?? 0,
        y: box?.y ?? 0,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
      },
    };
  });

async function open(
  page: Page,
  options: ShotOptions,
  shot: Shot,
): Promise<void> {
  const players = Array.from(
    { length: shot.players },
    (_, i) => `p${String(i + 1)}`,
  );
  const theme = options.theme ? `&theme=${options.theme}` : "";
  await page.goto(
    `${HARNESS}/?module=${options.modules}&service=mock&players=${players.join(",")}${theme}`,
  );
  await page
    .locator(".mav-dock-tile[data-connected]")
    .nth(shot.players)
    .waitFor({ timeout: 30_000 });
  const fonts = existsSync(FONTS) ? FONT_CSS : "";
  await page.addStyleTag({ content: PAGE_CSS + fonts });
  for (const file of options.css)
    await page.addStyleTag({ content: readFileSync(resolve(file), "utf8") });
  if (shot.placement !== "left") {
    await page.locator(".mav-dock-placement").click();
    await page
      .getByRole("menuitemradio", {
        name: new RegExp(`^${PLACEMENTS[shot.placement]}`),
      })
      .click();
  }
  if (shot.layout === "focus" && shot.placement !== "scattered")
    await page.locator(".mav-dock-layout").click();
  await page.waitForTimeout(SETTLE_MS);
}

/** One picture: the dock and a margin round it, or the whole window when it is scattered. */
async function shoot(
  browser: Browser,
  options: ShotOptions,
  shot: Shot,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: shot.height },
    deviceScaleFactor: options.scale,
  });
  try {
    await serveFiles(page, options.art ? resolve(options.art) : null);
    await open(page, options, shot);
    const { box, ...numbers } = await told(page);
    const whole = shot.placement === "scattered" || box.width === 0;
    const x = Math.max(0, box.x - MARGIN);
    const y = Math.max(0, box.y - MARGIN);
    const clip = whole
      ? { x: 0, y: 0, width: WIDTH, height: shot.height }
      : {
          x,
          y,
          width: Math.min(WIDTH, box.x + box.width + MARGIN) - x,
          height: Math.min(shot.height, box.y + box.height + MARGIN) - y,
        };
    await page.screenshot({
      path: join(options.out, `${shot.name}.png`),
      clip,
    });
    console.log(`${shot.name}: ${JSON.stringify(numbers)}`);
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const options = parseShotArgs(process.argv.slice(2));
  for (const file of options.css)
    if (!existsSync(file)) throw new OptionsError(`No stylesheet ${file}`);
  mkdirSync(options.out, { recursive: true });
  const server = await harness();
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  try {
    for (const shot of shotsOf(options)) await shoot(browser, options, shot);
    console.log(`Pictures in ${basename(resolve(options.out))}/`);
  } finally {
    await browser.close();
    if (server) stop(server);
  }
}

try {
  await main();
} catch (error: unknown) {
  // A mistake on the command line is said plainly; anything else keeps its trace.
  if (!(error instanceof OptionsError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
