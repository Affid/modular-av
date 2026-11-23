# Third-party notices: modular-av-dock-spaceship

This module bundles no third-party code. Its artwork (`art/`) was made
for this module and is under its MIT licence: the pictures (WebP) are
rendered by Blender from scenes that are scripts in its repository
(`tools/art/spaceship`), or computed by them (the snow, the masks). No
image model went into them.

## The readout's font

`fonts/DSEG14Classic-Regular.woff2` is **DSEG14 Classic** from DSEG
0.46 by keshikan (<https://www.keshikan.net/fonts-e.html>), under the
SIL Open Font License 1.1, whose full text ships beside it as
`fonts/DSEG-LICENSE.txt`. "DSEG" is its Reserved Font Name. The font is
shipped as it is published, unchanged. The build takes both files from
the font's npm package (`dseg` 0.46.0), pinned by its hash; neither is
in the repository.

## What the pictures show that was not made here

All of it is published under CC0 1.0 (public domain), which asks for no
credit; it is named here so that the pictures can be traced and made
again.

Two photographed surfaces, used as textures, from Poly Haven:

- `green_metal_rust` (the grain, chips, scratches and rust of every
  painted steel face: the bulkhead, the monitors' cases, the plates):
  <https://polyhaven.com/a/green_metal_rust>
- `blue_metal_plate` (the scuffs on the monitors' cases):
  <https://polyhaven.com/a/blue_metal_plate>

Three scanned models, from Poly Haven, hung on the bulkhead (the roll
of tape and the tool rails are built by the scenes):

- `korean_fire_extinguisher_01`:
  <https://polyhaven.com/a/korean_fire_extinguisher_01>
- `clipboard`: <https://polyhaven.com/a/clipboard>
- `combination_wrench`: <https://polyhaven.com/a/combination_wrench>

The letters on the extinguisher's label are set in two DejaVu fonts
(DejaVu Sans Condensed Bold and DejaVu Sans Mono, release 2.37,
<https://dejavu-fonts.github.io>), under the Bitstream Vera and Arev
fonts' licence, which lets the fonts be used for anything; only their
letters, rendered into the picture, are in this module, not the fonts.

None of these files is part of this module or of its repository: the
render script downloads them, pinned by their hashes. The cargo manifest
on the clipboard is invented: its marks and codes name no real company.
