# @modular-av/dock-vines

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
