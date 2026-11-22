# Modular A/V: Mirrors theme

<a href="https://github.com/Affid/modular-av/tree/stats">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Affid/modular-av/stats/badge-modular-av-dock-mirrors-dark.svg">
  <img alt="Downloads so far, updated daily" src="https://raw.githubusercontent.com/Affid/modular-av/stats/badge-modular-av-dock-mirrors-light.svg">
</picture>
</a>

A theme for [Modular A/V](../../README.md)'s dock, `modular-av-dock`: a
warlock's black mirror for scrying. The whole dock is one pane of old
black glass in a worn silver frame, and spirit hands reach out of the
glass to hold each camera. It is the look for a warlock at the table,
and each player picks their own theme, so it doesn't have to be
everyone's.

- **The mirror** is near-black glass with a faint flow in it and fine
  scratches that catch the light, in an old silver frame, tarnished
  black in its hollows and rubbed bright only in places.
- **Each camera** is held by two pale, clawed hands that come out of the
  glass beside it, their fingers laid over the picture's edges and a
  soft shadow under each fingertip. Neighbours differ: there are two
  poses, laid so that no camera is held as the one beside or above it.
- **A voice is light.** A cold violet light wells up in the glass where
  the hands come out while a player speaks, and the hands take it on. At
  rest the glass keeps a faint glow of its own.
- **Muted**, breath fogs the glass round the picture and the light sinks.
  **Deafened**, the light is stopped down and the hands' grip goes
  slack. **Out of the call**, smoke lies over the mirror, it is cracked
  from a blow at its upper right corner, the hands let go and fade back
  into the glass, and the gem greys. A camera that is off is black glass
  reflecting a window.
- **Your own level**: nine marks cut into the glass above your own
  camera hold light as far as your voice goes.
- **Each name** is lettered on the glass under the picture, with the
  player's colour as a cut gem in a silver collet before it. States and
  other modules' badges are small chips of black glass in silver bezels
  on the picture's corners.
- **The header and the voice panel** are panes of the same mirror,
  parted from the cameras by silver bars. The buttons are little panes of
  glass in silver bezels; a pressed mute or deafen glows ember red, a
  camera that is on violet, and leaving is dark with an ember icon.
- **Where the cameras leave room**, a hand rises out of the glass holding
  up a contract by its top edge, in an invented script, sealed in red,
  its signature line still empty; from more room a second hand offers you
  the quill.
- Menus and the settings window take a palette of dark glass.

The hands and the light take room round each picture: cameras that fill
the dock are smaller than in the dock's own look (245 against 288 pixels
wide for three cameras in a dock 300 wide, 121 against 141 for nine,
still two to a row).

It works in every layout. The theme suggests a docked one, where the
dock is the mirror; scattered over the map, each camera carries its own
pane of the glass, and the header and the panel are a small mirror of
their own. In the theme list it is **Mirrors (a warlock's black mirror)**.

## Install

Install it from Foundry's module browser with its manifest:

```text
https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-dock-mirrors/module.json
```

It requires `modular-av-dock` (and through it `modular-av`). Enable it in
your world, then choose it in **Voice & Video Settings → Appearance**: each
player picks their own theme, or follows the world's theme, which a GM sets
there too.

## What it changes

- Nothing about what the dock does: it restyles the dock through the
  dock's theme API (`docs/dock-theming.md`), and keeps every rule of it:
  mute, deafen, speaking, blocked and connection states always show, faces
  stay clear of the hands, text and icons meet WCAG AA, and nothing moves
  when your system asks for reduced motion.
- Its stylesheet loads only while the theme is chosen.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one theme, registered with the dock's
  `themes.register` (`src/index.ts`).
- **Code**: that file and a stylesheet (`public/mirrors.css`). No logic
  of its own: what follows the room under the cameras does so in the
  stylesheet, from a number the dock sets, and the poses of the hands
  follow the dock's columns. The entry file is held under 2 KB and the
  stylesheet under 14 KB.
- **Pictures**: 26 WebP files in `public/art`, about 220 KB together.
  All of them are rendered: the glass, the silver frame, its bars and the
  bezels; two poses of the hands, each with its light at rest and
  speaking; the gem; the level's marks; the fog, the crack, the dark pane
  of a camera that is off and the pane a scattered camera carries; the
  contract and the quill. They are rendered with Blender from scenes that
  are scripts in this repository (`tools/art/mirrors/render`); the hands
  are MakeHuman's CC0 base mesh, cut out and posed by those scripts with
  its own rig. Making them again needs Blender 4.5 or later:
  `pnpm art:mirrors:render` fetches what the scenes read, renders,
  converts and lists each picture with its hash in
  `tools/art/mirrors/rendered.json`. No test can render, so a test fails
  when the files here are not the ones listed.
- **Third-party code**: none. The rendered pictures use photographed
  textures and a 3D model that are all CC0: see
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). **Network**: none.
  **Storage**: none.
- **Tests**: two browser test files (`pnpm playwright test
packages/dock-mirrors`). One runs the shared theme contract from
  `@modular-av/testing` in four layouts and checks the hands, the light,
  the states, the name and the level; the other checks the mirror, its
  bars and buttons (the menu arrow's chevron is measured on the pixels),
  and what the free room shows. The art tool has unit tests of its own,
  and one that ties the stylesheet's numbers to the measures the pictures
  were made to.

## Licence

MIT, artwork included: the pictures in `public/art` were made for this
module by the scripts in `tools/art/mirrors`, which are part of this
repository. No image model went into them. The photographed textures and
the 3D model the renders use are in the public domain (CC0).
