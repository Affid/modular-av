# @modular-av/kit

## 0.8.2

### Patch Changes

- d8756e8: A menu's button closes it when clicked again (the microphone's and the
  camera's arrows, a tile's menu, "More controls"); it used to open the
  menu once more.

## 0.8.1

No changes in this release.

## 0.8.0

### Minor Changes

- 67d5dd3: "Show one player large" shows one player large: their tile across the
  dock with everyone else as thumbnails under it (on a side) or in two rows
  beside it (at the top or bottom), instead of everyone at the largest size.
  It starts with the first other player, not your own camera; a tile's menu
  still picks who. Kit: `fitSpeaker` fits it.

  Collapsed on a side, the dock is a narrow rail of its buttons with the
  status written down it, so Foundry gets the column back (as the slim bar
  does at the top or bottom).

  The voice panel keeps its size while a warning comes and goes (speaking
  while muted turns on and off as you talk): warnings sit beside the
  connection line. At the top or bottom the panel is plain like the header.

## 0.7.0

### Minor Changes

- e603289: The docked dock resizes. Hovering its inner edge (the one facing the
  canvas) shows a small three-line grip: drag it, or the edge, to make the
  dock wider on the left or right, or taller at the top or bottom. The grip
  also takes the arrow keys, and Home on the grip or a double-click on the
  edge goes back to the theme's size. Each player's size is their own and
  lasts across reloads; on another device it shows from that device's next
  load. The dock is never smaller than 200 × 150 px or more than half
  the window. Themes still set the default with `--mav-dock-width` and
  `--mav-dock-height`, and the edge and grip can be restyled with
  `.mav-dock-edge` and `.mav-dock-edge-grip`.

  Kit: `dragToResize` takes an optional `max()`, read when a drag starts, and
  an edge a drag didn't move keeps its size even outside the limits.

## 0.6.0

No changes in this release.

## 0.5.0

### Patch Changes

- f5b2bcb: Popovers whose content arrives after they open, such as the connection
  details, are placed again as they grow, so they stay by what opened them
  instead of spilling below it.

## 0.4.0

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 8e37fee: The dock's scattered layout: every camera on its own, against a corner or
  edge of the screen or wherever it is dragged, moved and resized with the
  pointer or the keyboard, saved per player, kept clear of Foundry's
  sidebar, controls, hotbar and chat. A GM can save the arrangement as a
  scene's layout for everyone. Themes: other modules register them through
  the dock's API, each player picks one (or follows the world's), and tile
  frames are declared, so the dock leaves room for them.

### Patch Changes

- 254ff35: Roving focus leaves alone the arrow keys an item used: the floating
  dock's move button moves the dock instead of the focus.

## 0.2.0

No changes in this release.

## 0.1.0

### Minor Changes

- First release of the shared API types, UI helpers and test tooling
  (fake Foundry, mock service, service, UI and effects contracts).
