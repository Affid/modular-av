// Draws the vines theme's pictures into packages/dock-vines/public/frames.
//
//   node tools/art/vines/cli.ts           write them
//   node tools/art/vines/cli.ts --check   fail if the shipped ones differ
import { ART_DIR, staleArt, writeArt } from "./files.ts";

if (process.argv.includes("--check")) {
  const stale = await staleArt(ART_DIR);
  for (const name of stale)
    console.error(`${name}: not what the generator draws`);
  if (stale.length === 0) console.log("The vines art is up to date.");
  process.exitCode = stale.length > 0 ? 1 : 0;
} else {
  const written = await writeArt(ART_DIR);
  console.log(`Wrote ${String(written.length)} pictures to ${ART_DIR}`);
}
