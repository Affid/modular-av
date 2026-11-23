// Where the spaceship theme's pictures are shipped from. All of them are
// rendered or computed in Blender's Python (rendered.ts locks them); none is
// drawn.
import { join } from "node:path";
import { ROOT } from "../../workspace.ts";

export const ART_DIR = join(
  ROOT,
  "packages",
  "dock-spaceship",
  "public",
  "art",
);
