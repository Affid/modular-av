// Where the plates theme's pictures are shipped from. All of them are
// rendered (rendered.ts locks them); none is drawn.
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";

export const ART_DIR = join(ROOT, "packages", "dock-plates", "public", "art");
