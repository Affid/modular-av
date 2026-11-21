# @modular-av/dock-vines

## 0.16.0

### Minor Changes

- e10285a: The vines theme is redrawn, and the dock under it is one plant. In the
  theme list it is now "Vines (a druid's grove)".

  - Each camera sits in a frame that looks grown from branches, twisted
    into an uneven loop with ivy from one of its corners: four frames, no
    two the same shape, with the picture cut to its frame, so cameras are
    no longer rectangles.
  - Each name is cut into a strip of bark that hangs under its camera, so
    the picture is clear of it, and your own level is a shoot along your
    frame that greens with your voice.
  - Docked, floating or in a window, a trunk of the same branches runs down
    the dock's free edge. Boughs off it hold the header and the voice
    panel, and the cameras hang under them on lianas. Where the cameras
    leave room, the lianas' loose ends hang on and a leafy branch grows in
    off the trunk, larger with more room. Docked at the top or bottom, the
    trunk runs across the top.
  - A muted player's leaves turn to autumn, a player who is out of the call
    has bare stems, and a soft light in a tint of the speaker's colour
    shows on the picture's rim in place of the speaking ring.
  - The dock, its menus and the settings window take a palette of bark and
    leaf instead of the green one.

  The plant takes room: cameras that fill the dock are somewhat smaller
  than in the dock's own look. The stylesheet's size budget goes from 8 KB
  to 19 KB.

## 0.15.0

No changes in this release.

## 0.14.1

No changes in this release.

## 0.14.0

No changes in this release.

## 0.13.2

No changes in this release.

## 0.13.1

No changes in this release.

## 0.13.0

No changes in this release.

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.1

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.2

No changes in this release.

## 0.8.1

No changes in this release.

## 0.8.0

### Patch Changes

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

No changes in this release.

## 0.6.0

### Patch Changes

- 363768a: "Plan your modules" is now a signal chain of cards. On air shows what
  the world runs; Next is the setup you build, in the order a call flows:
  effects, the service, the cameras and the Dock's theme. Open a stage to
  see its modules as tiles, each with what it is for and one action; a
  world with no service starts from three common builds. Load in, Go live
  and Soundcheck walk you to Foundry's Setup screen and back, and
  Soundcheck opens each module's settings where they live.

  For module authors: the Voice & Video Settings window can open on a tab
  (`SettingsHost.tab`, a `SettingsWindowTab`; while it is open,
  `SettingsHost.onTabRequest` tells the surface, which keeps what is
  drafted), its code loads when it first opens, and each module's manifest
  can give its card an icon and a few facts (`flags["modular-av"].icon`
  and `.facts`).

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 8e37fee: First release. Vine leaves around the dock's cameras, growing from the
  corner each one sits in, glowing while someone speaks and grey while
  they're muted, with a green palette. Choose it in Voice & Video Settings,
  Appearance.
