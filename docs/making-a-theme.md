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
- **The harness is not Foundry.** Its docked dock has no height limit,
  and its cameras are a test pattern.

## Checking

1. `pnpm format:check && pnpm lint && pnpm typecheck` before anything
   long.
2. The theme's browser tests: `themeContract` in each layout, and tests
   of its own that read computed styles (which picture, which layer has
   a width), not pixels. See `packages/dock-vines/test/browser`.
3. `pnpm verify`.
4. In Foundry, with real video: `pnpm theme:foundry out <theme id>
[camera files]` puts four users in a call and takes the GM's dock
   through every placement, with a picture and the layout's numbers for
   each, and the page's errors at the end.
5. A review by someone who didn't write it.
