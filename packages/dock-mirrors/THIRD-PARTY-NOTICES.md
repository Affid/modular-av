# Third-party notices: modular-av-dock-mirrors

This module bundles no third-party code. Its artwork (`art/`) was made
for this module and is under its MIT licence: the pictures (WebP) are
rendered by Blender from scenes that are scripts in its repository
(`tools/art/mirrors`). No image model went into them.

The pictures use things that were not made here. All are published
under CC0 1.0 (public domain), which asks for no credit; they are named
here so that the pictures can be traced and made again.

- MakeHuman's base mesh and its default rig with its weights (every
  hand: the left forearm and hand are cut out of the body and posed
  with the rig): <https://github.com/makehumancommunity/makehuman>,
  files `makehuman/data/3dobjs/base.obj`,
  `makehuman/data/rigs/default.mhskel` and
  `makehuman/data/rigs/default_weights.mhw` at commit
  `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. The repository's
  `LICENSE.md` releases the base mesh and its assets under CC0, and each
  file says so itself. MakeHuman's program code (AGPL) is not used.
- Poly Haven, photographed surfaces used as textures:
  - `rusty_metal_sheet` (the silver's tarnish and patches, the glass's
    faint flow and smudges): <https://polyhaven.com/a/rusty_metal_sheet>
  - `lacquered_cherry_wood` (only its roughness: the glass's fine
    scratches): <https://polyhaven.com/a/lacquered_cherry_wood>
- ambientCG, `Paper003` (the contract's creased sheet):
  <https://ambientcg.com/a/Paper003>

None of these files is part of this module or of its repository: the
render script downloads them, pinned by their hashes.
