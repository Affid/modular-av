// Draws the scrolls theme's drawn pictures into
// packages/dock-scrolls/public/art, beside the rendered ones
// (`pnpm art:scrolls:render` makes those, with Blender).
//
//   node tools/art/scrolls/cli.ts           write them
//   node tools/art/scrolls/cli.ts --check   fail if the shipped art differs
import { ART_DIR, staleDrawn, writeDrawn } from "./files.ts";
import { readManifest, staleRendered } from "./rendered.ts";

if (process.argv.includes("--check")) {
  const drawn = await staleDrawn(ART_DIR);
  const rendered = await staleRendered(ART_DIR, await readManifest());
  for (const name of drawn) console.error(`${name}: not what the script draws`);
  for (const name of rendered)
    console.error(`${name}: not the picture listed in rendered.json`);
  if (drawn.length + rendered.length === 0)
    console.log("The scrolls art is up to date.");
  process.exitCode = drawn.length + rendered.length > 0 ? 1 : 0;
} else {
  const written = await writeDrawn(ART_DIR);
  console.log(`Wrote ${String(written.length)} pictures to ${ART_DIR}`);
}
