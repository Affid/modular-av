// A trial theme: the harness registers one from its address alone
// (?trial=<id>:<reach>), for pictures of a look that has no module yet
// (pnpm theme:shots --trial). Whoever opens the page serves its stylesheet.
import { TRIAL_STYLESHEET } from "@modular-av/testing/harness/trial";
import { expect, type Page, test } from "@playwright/test";

const STYLESHEET = `.mav-theme-probe .mav-dock-tile-frame { outline: 3px solid rgb(255, 215, 0); }`;

async function open(page: Page, query: string): Promise<void> {
  await page.route(`**/${TRIAL_STYLESHEET}*`, (route) =>
    route.fulfill({ contentType: "text/css", body: STYLESHEET }),
  );
  await page.goto(`/?module=dock&service=mock&players=p1&${query}`);
  await expect(page.locator(".mav-dock-tile[data-connected]")).toHaveCount(2, {
    timeout: 20_000,
  });
}

test("registers a theme of that id and reach, shows it, and loads its stylesheet from where the page serves it", async ({
  page,
}) => {
  await open(page, "trial=probe:0.1,0.05,0.2,0.05");

  await expect(page.locator("html")).toHaveClass(/mav-theme-probe/);
  await expect(page.locator("link[data-mav-theme]")).toHaveAttribute(
    "href",
    `/${TRIAL_STYLESHEET}`,
  );
  const tile = page.locator(".mav-dock-tile").first();
  const frame = tile.locator(".mav-dock-tile-frame");
  await expect(frame).toHaveCSS("outline-color", "rgb(255, 215, 0)");
  // The frame layer reaches past the tile by the reach asked for.
  const [box, layer] = [await tile.boundingBox(), await frame.boundingBox()];
  if (!box || !layer) throw new Error("Not on screen");
  expect((box.x - layer.x) / box.width).toBeCloseTo(0.05, 2);
  expect((box.y - layer.y) / box.width).toBeCloseTo(0.1, 2);
  expect(
    (layer.y + layer.height - (box.y + box.height)) / box.width,
  ).toBeCloseTo(0.2, 2);
});

test("is offered in the theme list without being chosen, when another theme is asked for", async ({
  page,
}) => {
  await open(page, "trial=probe&theme=default");

  await expect(page.locator("link[data-mav-theme]")).toHaveCount(0);
  await page.locator(".mav-dock-settings").click();
  await page.getByRole("tab", { name: "Appearance" }).click();
  await expect(
    page.getByLabel("Theme for everyone", { exact: true }).locator("option"),
  ).toHaveText(["Modular A/V's own look", "Trial"]);
});

test("gives players colours of their own when asked, as a table's have", async ({
  page,
}) => {
  await open(page, "colours=1");
  const colours = await page
    .locator(".mav-dock-tile")
    .evaluateAll((tiles) =>
      tiles.map((tile) =>
        (tile as HTMLElement).style.getPropertyValue("--mav-dock-tile-color"),
      ),
    );

  expect(colours).toEqual(["#b3262e", "#2f6fd0"]);
});
