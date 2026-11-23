# Modular A/V: Spaceship theme

<a href="https://github.com/Affid/modular-av/tree/stats">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Affid/modular-av/stats/badge-modular-av-dock-spaceship-dark.svg">
  <img alt="Downloads so far, updated daily" src="https://raw.githubusercontent.com/Affid/modular-av/stats/badge-modular-av-dock-spaceship-light.svg">
</picture>
</a>

A theme for [Modular A/V](../../README.md)'s dock, `modular-av-dock`: the
hold of a worn cargo hauler. The dock is a bulkhead of the hold, and each
camera is a small CRT monitor screwed to it. It is the look for a
science-fiction game at the table, and each player picks their own
theme, so it doesn't have to be everyone's.

- **The bulkhead**: grey-green painted steel sheets riveted to a frame,
  each sheet painted a little apart, chipped and rusted where hands and
  cargo knocked them, edged in angle steel. The header and the voice
  panel are gunmetal plates riveted on, dirt settled along their foot.
- **Each camera** is a small CRT monitor in a chipped safety-yellow
  steel case, behind curved dusty glass that catches the hold's work
  lamp; the tube's scan lines lie in its margin, never over a face. The
  paint is worn to bare steel where thumbs rub the chin and where the
  case was knocked.
- **Each name** is lit on a green 14-segment readout in the monitor's
  chin, its never-lit segments faint behind the glass. A long name
  slides along the readout and back (it stops, cut short, when your
  system asks for reduced motion).
- **A voice** drives the readout full and lights the TX lamp beside it,
  green on the paint round it. **Muted**, two strips of gaffer tape cross
  the grille. **Deafened**, the headset is taken off and hung by its band
  on a bracket screwed to the case. **A weak link** snows in the tube's
  margin. **Out of the call** the set is off: the tube dead, the readout
  dark but for a grey trace of the name.
- **A camera that is off** shows the tube lit with no picture, a dim
  raster of lines.
- **The player's colour** is a strip of vinyl tape over the case's top
  left corner.
- **Your level** is a column of twelve green segments in a window in your
  own monitor's side.
- **The buttons** are rubber keys poking through holes in the panel's
  plate; the ones that latch carry an LED in their top edge, lit when the
  key is down: green for the camera, red for muted and deafened, amber
  for sharing the screen. The call's status is a pilot lamp in the
  header: green in the call, amber while joining, red once the call has
  ended, dark before one. The states' icons and other modules' badges are rubber keys
  too, at the picture's upper corners.
- **Where the cameras leave room**, the crew's things hang on tool rails
  on the bare bulkhead, more of them the more room there is: a roll of
  tape, a wrench, a clipboard with the cargo manifest, and a fire
  extinguisher in its bracket.

A monitor's case takes room round its picture: cameras that fill the
dock are somewhat smaller than in the dock's own look (258 against 288
pixels wide for three cameras in a dock 300 wide, 127 against 141 for
nine).

It works in every layout. The theme suggests a docked one, where the
dock is the bulkhead; scattered, each monitor stands on its own. In the
theme list it is **Spaceship (a cargo hauler's hold)**.

## Install

Install it from Foundry's module browser with its manifest:

```text
https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-dock-spaceship/module.json
```

It requires `modular-av-dock` (and through it `modular-av`). Enable it in
your world, then choose it in **Voice & Video Settings → Appearance**: each
player picks their own theme, or follows the world's theme, which a GM sets
there too.

## What it changes

- Nothing about what the dock does: it restyles the dock through the
  dock's theme API (`docs/dock-theming.md`), and keeps every rule of it:
  mute, deafen, speaking, blocked and connection states always show, faces
  stay clear of the case, text and icons meet WCAG AA, and nothing moves
  when your system asks for reduced motion.
- Its stylesheet loads only while the theme is chosen.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one theme, registered with the dock's
  `themes.register` (`src/index.ts`).
- **Code**: that file and a stylesheet (`spaceship.css`, kept in
  parts in `styles/` and joined when the module is built). No logic
  of its own: what follows the room under the cameras does so in the
  stylesheet, from a number the dock sets. The entry file is held under
  2 KB and the stylesheet under 38 KB.
- **Pictures**: 57 WebP files in `public/art`, about 1.25 MB together (the ten monitors, under dusty glass that covers the whole tube, are 860 KB of it).
  All of them are rendered or computed: the bulkhead; each monitor,
  yours and the others', at rest, speaking, muted, deafened and both;
  the readout's window; the tape of your colour; the tube's scan lines,
  its snow and their masks; the plates, their rims and dirt, the angle
  steel and the stencilled marking; the pilot lamp and the panel's
  annunciators; every rubber key, at rest, lit and down; the tool rail,
  the tape, the wrench, the clipboard and the extinguisher. They are
  rendered with Blender from scenes that are scripts in this repository
  (`tools/art/spaceship/render`), all under one light. Making them again
  needs Blender 4.5 or later: `pnpm art:spaceship:render` fetches what
  the scenes read, renders, converts and lists each picture with its
  hash in `tools/art/spaceship/rendered.json`. No test can render, so a
  test fails when the files here are not the ones listed.
- **The readout's font**: DSEG14 Classic by keshikan, under the SIL Open
  Font License 1.1. The build fetches it, pinned by its hash, from the
  font's npm package, and ships it with its licence in `fonts/`.
- **Third-party code**: none. The rendered pictures show two
  photographed textures and three scanned models from Poly Haven, all
  under CC0: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
  **Network**: none. **Storage**: none.
- **Tests**: two browser test files (`pnpm playwright test
packages/dock-spaceship`). One runs the shared theme contract from
  `@modular-av/testing` in four layouts and checks the monitors and what
  each shows of its player, the name on its readout, your level, and the
  states' and badges' keys; the other checks the bulkhead and its plates
  in every placement, the keys (the menu arrow's chevron is measured on
  the pixels), the pilot lamp, and what the bare bulkhead carries. The
  art tool has unit tests of its own, and one that ties the stylesheet's
  numbers to the measures the pictures were rendered to.

## Licence

MIT, artwork included: the pictures in `public/art` were made for this
module by the scripts in `tools/art/spaceship`, which are part of this
repository. No image model went into them. The photographed textures and
scanned models the renders use are in the public domain (CC0). The font
keeps its own licence, the SIL Open Font License 1.1.
