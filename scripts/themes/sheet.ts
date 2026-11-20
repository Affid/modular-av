// A contact sheet: pictures side by side at one size, to compare drawings
// (candidates from a generator with different seeds, say) at a glance.
//
//   node scripts/themes/sheet.ts <sheet.png> <width> <height> <picture>...
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

/** The ground the dock's pictures are seen on. */
const GROUND = "#1c150e";

const [out, width, height, ...pictures] = process.argv.slice(2);
const size = [Number(width), Number(height)];
if (!out || pictures.length === 0 || !size.every((n) => n > 0)) {
  console.error(
    "Usage: node scripts/themes/sheet.ts <sheet.png> <width> <height> <picture>...",
  );
  process.exit(1);
}

const cells = pictures
  .map(
    (picture) =>
      `<img src="${pathToFileURL(resolve(picture)).href}" style="width:${String(size[0])}px;height:${String(size[1])}px;outline:1px solid #554">`,
  )
  .join("");
// A page of its own on disk: one without an address can't load local pictures.
const dir = mkdtempSync(join(tmpdir(), "theme-sheet-"));
const page = join(dir, "sheet.html");
writeFileSync(
  page,
  `<body style="margin:0;background:${GROUND};display:flex;flex-wrap:wrap;gap:8px;padding:8px">${cells}</body>`,
);
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await tab.goto(pathToFileURL(page).href);
  await tab.waitForLoadState("networkidle");
  await tab.screenshot({ path: resolve(out), fullPage: true });
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
