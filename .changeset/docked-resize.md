---
"@modular-av/dock": minor
"@modular-av/kit": minor
---

The docked dock resizes. Hovering its inner edge (the one facing the
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
