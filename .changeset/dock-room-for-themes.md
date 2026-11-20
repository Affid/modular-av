---
"@modular-av/dock": minor
---

Themes can ask for room round their tiles apart from the size of their
frames, and are told the room under the tiles.

- A theme's `frames.room` is how much room the dock keeps round each
  tile, and `frames.gridRoom` the room while tiles are laid out in a grid
  (docked, floating or in a window of the dock's own). The frame layer
  stays the size of `frames.reach` in every layout. Without either, the
  room is the reach, as before. The dock sets the room it keeps as
  `--mav-dock-room-*` on `.mav-dock`.
- The grid fits inside the tile list's padding, so a theme can keep room
  round the whole grid for its artwork.
- `--mav-dock-spare` on the tile list is the height left under the grid,
  and `--mav-dock-tile-room` on each tile the height left under it when
  it ends its column, for themes that draw there.

Nothing changes for themes that use none of these.
