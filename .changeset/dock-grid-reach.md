---
"@modular-av/dock": minor
---

Themes can give their frames a different reach for grids. A theme's
`frames.gridReach` is how far its frames reach past a tile while tiles
are laid out in a grid (docked, floating or in a window of the dock's
own); `frames.reach` stays the reach round a scattered tile, and is used
everywhere when a theme gives no `gridReach`. The grid now also fits
inside the tile list's padding, so a theme can keep room round the whole
grid for its artwork. Nothing changes for themes that use neither.
