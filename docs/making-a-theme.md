# Making a theme for the dock

[dock-theming.md](dock-theming.md) is the reference: what a theme may
style and what it must keep. This is the working guide beside it: how the
vines theme (`packages/dock-vines`) was made, what cost time, and what the
next theme can reuse. Read the reference first.

## Decide the look before building it

A look is cheap to change in a picture and dear to change in code. The
vines theme went through five rounds of pictures before anything in the
repository changed.

- **Words first.** Settle in a few sentences what the theme is made of and
  what the dock becomes under it.
- **Then pictures, in the test harness.** `pnpm theme:shots` opens the
  dock in the harness, lays trial stylesheets and trial pictures over the
  theme as it is, and takes a picture of each case:

  ```bash
  pnpm theme:shots out --modules dock,dock-vines --theme vines \
    --css trial.css --art trial-pictures \
    --players 2,8 --heights 900,1080 --placements left,top --layouts grid,focus
  ```

  A trial stylesheet reaches the trial pictures as
  `url("/theme-shots/art/<file>")`. Each picture's line also says the
  tile's width, the spare height and whether the list scrolls.

  A look that has no module yet is shot as a trial theme, registered for
  the pictures alone, with the trial stylesheets as its own:

  ```bash
  pnpm theme:shots out --trial moss:0.1,0.05,0.2,0.05 --css moss.css --art moss-art
  ```

  The numbers are how far its frames reach past a tile (top, right,
  bottom, left, as fractions of its width): what the theme will register.

- **Show the states and the dock's other shapes too**, not only cameras
  at rest:

  ```bash
  pnpm theme:shots out --theme scrolls --modules dock,dock-scrolls --players 3 \
    --states muted+deafened+poor,speaking+badge,camera-off+menu \
    --viewer muted --docks open,collapsed --widths 300,480
  ```

  `--states` says what each player after the viewer is doing, in their
  order (`speaking`, `muted`, `deafened`, `poor` for a poor link,
  `camera-off`, `menu` for the pointer over their camera, `badge` for
  another module's badge; `-` for nothing), and they are made to happen
  through the players' own commands. With several `--players` counts, a
  picture with fewer players than `--states` names leaves the rest out;
  it is an error only when no picture has them all. A badge comes from the harness's
  sample module, which also adds a button and rows of its own to the
  dock; it is loaded only when a player has `badge`. `--viewer` says what
  the viewer is doing: `out` takes them out of the call, and `muted`,
  `deafened` and `camera-off` go through the core's commands, so the
  dock's own buttons show pressed (the camera's button is pressed while
  the camera is on, so `camera-off` shows it at rest). `--docks`
  and `--widths` add pictures of the dock put away and at other widths.
  The harness's players have colours of their own in these pictures.

- **Show every idea large and small, with few cameras and many.** A tile
  in a docked dock is anywhere from 120 to about 255 pixels wide. Ideas
  that work on a large tile often fail on a small one.
- **Use Foundry's fonts.** The harness has none of its own; the script
  loads them from the local Foundry (`FOUNDRY_APP_DIR`) when there is
  one. Foundry's text face is Signika (`--font-body`) and its heading
  face Modesto Condensed (`--font-h1`, Latin letters only).
- **Say what each idea costs**, in pixels of camera, beside its picture.
- **Ask about a choice with two pictures**, not with the names of parts.

## What holds a theme together

These came from the vines theme and are worth asking of any theme.

- **One material for everything.** Its frames, the trunk, the boughs, the
  lianas and the branch are all the same twisted strands.
- **The interface stays as it is, and the material holds it.** A name is
  on a plate that hangs from the frame; the header is a board the boughs
  hold. What is only laid on top reads as stuck on.
- **States show through the material.** Muted is autumn leaves, out of
  the call is bare stems, the level is a shoot that greens.
- **Edges come from the material.** No outline is drawn, and nothing is
  brighter than what it decorates.

## Draw with a script

The vines theme's pictures are drawn by `tools/art/vines` from fixed
seeds: the same pictures every time, and a test fails when the shipped
files are not what the script draws (`pnpm art:vines` writes them). A
change of one number redraws all of them, and the script's own measures
can be tested.

Reusable as they are, for another material drawn as lines:

| Module                 | What it gives                                                           |
| ---------------------- | ----------------------------------------------------------------------- |
| `strands.ts`           | Strands twisted into a bundle along any line; a picture over its shadow |
| `sprig.ts`, `paint.ts` | Leaves along any path, kept out of where they may not reach             |
| `random.ts`            | Seeded random numbers                                                   |
| `svg.ts`               | A picture's wrapper, and what tests read from it                        |
| `files.ts`, `cli.ts`   | The list of files, writing them, and the test that they are current     |

`pnpm theme:sheet sheet.png 275 260 a.svg b.svg …` lays candidates side
by side, to choose a seed by eye.

## Render what can't be drawn

The scrolls theme (`packages/dock-scrolls`) is glass, cut stone, bone and
worn vellum, and drawn gradients never looked like them. Its pictures of
things are rendered with Blender instead; only what is flat by nature
(ink, gold leaf, cracks, a button's facets) is drawn. What that takes:

- **Scenes are scripts** (`tools/art/scrolls/render`, run headless by
  `pnpm art:scrolls:render`), one to a picture, with every seed and
  number in them. One room and one light for all of them (`room()`), or
  shadows disagree between neighbours.
- **The measures are said once**, in `tools/art/scrolls/measures.json`,
  which the scenes, the drawing script and a test of the stylesheet all
  read.
- **No test can render**, and a render differs a little between
  machines. The shipped pictures are locked instead: the render script
  lists each with its size and hash (`rendered.json`), and a test fails
  when the files are not the ones listed.
- **Photographed textures stay out of the repository.** They are pinned
  by address and hash and fetched before rendering
  (`tools/art/scrolls/textures.ts`), and named in the module's notices.
- **A second rendered theme reuses the first one's studio.** The hides
  theme (`tools/art/hides`) has scenes, measures and a list of its own,
  and stands them in the scrolls theme's room and light; one script
  renders either (`scripts/art/render-theme.ts`). It also shows a
  scanned shape, a skull from a museum's open collection: pinned and
  fetched like a texture, its licence read in the collection's own
  catalogue, and named in the notices.
- **Render no larger than a sharp screen shows.** A hide's leather,
  lacing and wood are fine detail: at a pixel to a tile unit a frame
  picture weighed 148 KB, at three quarters of that 88 KB with nothing
  to see of the loss. Small things (a tag, a button) need two pixels to
  a CSS pixel, not four.
- **Colour comes from the stylesheet.** The stones are rendered without
  colour and tinted by `background-blend-mode: multiply` over the
  player's colour, their flashes laid over that in a picture of their
  own.
- **Shadows are pictures too.** A shadow catcher puts a thing's shadow in
  the picture's transparency. Fade it out before the picture's edge, or
  it shows as a box on a light scene; and keep a shadow picture clear
  away from what casts it, or its noise lies on faces and fails the
  contract.
- **A ground that repeats is one whole repeat of its texture each way.**
  Half a repeat looks right in a dock 300 wide and shows a seam in a
  wider one.
- **WebP** keeps 15 pictures near 380 KB. Nothing here writes it but a
  browser: the render script converts through Chromium.

### What metal taught

The plates theme (`tools/art/plates`) is steel, mail and a little cloth,
all rendered. Metal has its own traps:

- **A metal looks like what it reflects.** Under this studio a metal
  comes out pale as zinc unless its own tone is low (about 0.09 for dark
  steel), and smooth it is chrome. "Polished" is the same dark steel with
  only the parts that stand proud made bright: the mesh says where, in an
  attribute the material reads (`render/steel.py`, `worn`).
- **A ground that repeats takes only lights that are the same
  everywhere**: the sun and the sky. A lamp lights the middle of the
  picture more than its edges, and the repeat shows as a seam in a wide
  dock. Measure it: the mean light of a strip at each edge
  (the mail and the header's steel are even to 2%).
- **Many small things of one mesh** (the mail's rings) are linked copies,
  and each takes its chance from its place within the repeat, so the
  picture meets itself.
- **A face seen straight on must be curved to read as a solid.** A flat
  disc takes one even tone however much texture is on it: the buckler
  read as drawn until its face was dished.
- **What grows with a camera can't meet what doesn't.** A plate scales
  with its tile and the mail has a size of its own: rings through holes
  in the plate would come in two sizes. The plates lie on the mail
  instead.
- **A small thing's shadow is kept close to it.** A shadow catcher's
  pale veil reaches far, and lies on the ground as a stain
  (`render/stage.py`, `close_shadow`).
- **Red-brown beside steel is rust**, whatever it is meant to be, and a
  theme that uses rust as a state can't have it as a ground. The cloth
  under the mail is blue.

## What must stretch is drawn to be cut

The dock's width and height are the player's. Nothing may be drawn for
one size.

- **A run of any length** is a tile that repeats (the trunk). Every wave
  in it fits the tile a whole number of times, its paths are sampled a
  whole number of times a tile and run past both ends, and nothing that
  can't repeat (a leaf, a twig) comes near the seam.
- **A run with ends** is one picture cut in three by `border-image` with
  `round` (a bough: joint, middle, tip). The middle is periodic and only
  the tip thins out. Such a picture needs a `width` and `height` of its
  own for the slices to mean pixels.
- **A box of any width** keeps its ends and stretches its middle (the
  name's plate).

## Two scales, kept apart

Some things grow with the tile: its frame, its lianas. Their pictures are
drawn 1000 units to a tile's width and placed in percentages of the tile.
Others are a fixed size on screen: the trunk, the boughs, a name's
height. They are drawn four units to a pixel. Every layout fault in the
vines theme was where the two met, for example a name of fixed height
under a tile whose room is a share of its width. Decide for each part
which it is.

## Say each size once

`frames.reach` is how far the art reaches; `frames.room` and
`frames.gridRoom` are the room the dock keeps round a tile. The
stylesheet reads them from `--mav-dock-frame-*` and `--mav-dock-room-*`
and sets none of its own. Where the stylesheet has to repeat one of the
script's measures (a tile's size, a slice's width), a test holds the two
together: `tools/art/vines/theme.test.ts`.

## Follow the room in the stylesheet

A theme has no code. What changes with the room under the tiles does so
from the two numbers the dock sets (`--mav-dock-spare`,
`--mav-dock-tile-room`), with `clamp()` as a switch:

```css
.mav-theme-x .mav-dock-tiles {
  /* 1 from 190 pixels of spare height, else 0. */
  --x-on: clamp(0, var(--mav-dock-spare, 0) - 189, 1);
}
.mav-theme-x .mav-dock-tiles::after {
  background: url("frames/branch.svg") right bottom / calc(275px * var(--x-on))
    260px no-repeat;
}
```

A background layer with no width isn't drawn. For one of several
pictures, subtract the switches from each other.

## Where things are drawn

There are only so many places a stylesheet can draw. The vines theme
uses them like this:

| Place                                  | What it carries                         |
| -------------------------------------- | --------------------------------------- |
| `.mav-dock` background, `::after`      | The ground, and the trunk over it       |
| Header and panel `::before`, `::after` | Four boughs                             |
| `.mav-dock-tiles::after`               | The branch, behind the tiles            |
| `.mav-dock-tile::before`               | The lianas, behind every tile           |
| `.mav-dock-tile-frame` and its two     | Frame and ivy, autumn leaves, the light |
| `.mav-dock-tile-name`, its two         | The plate, and the loops it hangs by    |

`isolation: isolate` on the dock makes `z-index: -1` mean "behind the
tiles and no further". Everything drawn has `pointer-events: none`.

## Traps

- **Scrolling.** Anything positioned inside the tile list counts toward
  what it scrolls, whether it is seen or not. Size it to the room there
  is. Frames wider than their room overflow sideways: the vines theme
  runs the list to the dock's edges and hides overflow across.
- **Two columns.** Tiles stop shrinking at 120 pixels and the list
  scrolls instead. In a dock 300 wide, a little too much room round a
  tile drops nine cameras from two columns to one.
- **Placements multiply the work.** Decide early what each gets. The
  vines theme mirrors itself on the right with `scaleX(-1)`, simplifies
  at the top and bottom, and leaves a collapsed dock plain.
- **The contract** (`themeContract`): nothing drawn in the middle 70% of
  a picture, shadows included; a mask on the video only, never on the
  media (it redraws the avatar); indicators over the frame; contrast is
  read from `background-color`, so a plate that is a picture needs a
  real colour under it.
- **Budgets.** `pnpm size:check` holds the stylesheet's and the entry's
  size; the art's total has a test. Run it early: it is the last step of
  `pnpm verify`.
- **One port, one Foundry.** The harness listens on one port and there
  is one local Foundry. A second checkout (a worktree, another session)
  runs its harness beside the first with `MAV_HARNESS_PORT=5175` before
  `pnpm test:browser`, `pnpm verify` or `pnpm theme:shots`; Foundry has
  to be taken in turns.
- **The harness is not Foundry.** Its docked dock has no height limit,
  its cameras are a test pattern, and it has none of Foundry's styles
  for form fields: a menu looks cramped there under any theme. Judge
  menus and the settings window in Foundry.
- **No blend mode against the camera.** `mix-blend-mode` on a layer over
  a tile has the browser draw the camera's picture through a group of
  its own: its pixels change, even where the layer is empty, and the
  contract's check that faces stay clear fails. Blend inside one element
  (`background-blend-mode` between its own layers): the hides theme
  lights a hide by drawing it once more with the light over it, cut to
  the hide by a mask.
- **A state that brightens the ground under text.** Contrast is checked
  from `background-color`, and a name on a picture has none: measure it
  on the pixels of a screenshot, in every state (a saved picture's
  numbers are coded for the screen; undo that first). A polished plate
  took the name from 9.9 to 1 down to 3.2 to 1; the plates leave a band
  under the picture that a voice never polishes.
- **A layer that isn't shown still loads its picture.** A pseudo-element
  at `opacity: 0`, or a background layer of no width, is fetched all the
  same. Only a picture named by a rule that doesn't match yet waits.
- **A module's description** is at most 500 characters: the planner's
  catalog refuses a longer one, and the core's build with it.
- **One gap.** The dock fits its grid with one gap. A row gap unlike the
  column gap made the scrolls theme's grid flip between two sizes.
- **Turned tiles.** A tile may be turned a little (`rotate`): its boxes
  on screen grow by a pixel or two, so tests measure the layout
  (`offsetLeft`), and a turned picture is drawn a touch softer.
- **A tile with no camera.** The tile's own ground is usually cleared
  for the frame; give the media a ground, or a camera that is off is a
  hole.
- **Light surfaces.** The dock's tokens are for a dark dock. On a light
  part (paper), set the ones used there again: text, the focus ring, and
  the colours of states (`--mav-warning`, `--mav-muted`, `--mav-blocked`,
  `--mav-speaking`), dark enough for 3 to 1.
- **A dock put away.** Collapsed at a side, the dock hides the menu
  arrows: a rule for a button "with an arrow beside it" still matches.
  At the top or bottom the list scrolls sideways: hide overflow across
  only where the dock is upright.
- **Name it after what it shows.** `vines`, `scrolls`: not after the
  character class it is for, which goes in its label ("Scrolls (a
  wizard's desk)").

## Checking

1. `pnpm format:check && pnpm lint && pnpm typecheck` before anything
   long.
2. The theme's browser tests: `themeContract` in each layout, and tests
   of its own that read computed styles (which picture, which layer has
   a width), not pixels. See `packages/dock-vines/test/browser`.
3. `pnpm verify`.
4. In Foundry, with real video: `pnpm theme:foundry out <theme id>
[camera files] [map image]` puts four users in a call and takes the
   GM's dock through every placement, with a picture and the layout's
   numbers for each; then the players' states, each of the dock's menus
   and the settings window, which only Foundry styles as players see
   them; and the page's errors at the end. With camera files of people
   and a map (`docs/images/README.md`) these are the pictures to show
   someone.
5. A review by someone who didn't write it.
