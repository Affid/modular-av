# Modular A/V: Vines theme

<a href="https://github.com/Affid/modular-av/tree/stats">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Affid/modular-av/stats/badge-modular-av-dock-vines-dark.svg">
  <img alt="Downloads so far, updated daily" src="https://raw.githubusercontent.com/Affid/modular-av/stats/badge-modular-av-dock-vines-light.svg">
</picture>
</a>

A theme for [Modular A/V](../../README.md)'s dock, `modular-av-dock`: each
camera sits in a frame of woven branches, with ivy growing from one of its
corners. While someone speaks, the picture's edge glows in a light tint of
their colour. While they're muted, their leaves turn to autumn, and a
player who is out of the call has bare stems. The dock, its menus and the
settings window take a palette of bark and leaf. It suits the dock's
scattered layout best, where each camera's ivy grows from the corner of
the screen it sits in, and the dock offers that layout when the theme is
chosen; it works in every layout.

![Four cameras scattered to the corners of Foundry's screen, each framed in the theme's vines](../../docs/images/dock-scattered-vines.png)

## Install

Install it from Foundry's module browser with its manifest:

```text
https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-dock-vines/module.json
```

It requires `modular-av-dock` (and through it `modular-av`). Enable it in
your world, then choose it in **Voice & Video Settings → Appearance**: each
player picks their own theme, or follows the world's theme, which a GM sets
there too.

## What it changes

- Nothing about what the dock does: it restyles the dock through the
  dock's theme API (`docs/dock-theming.md`), and keeps every rule of it:
  mute, deafen, speaking, blocked and connection states always show, faces
  stay clear of the leaves, text and icons meet WCAG AA, and nothing moves
  when your system asks for reduced motion.
- Its stylesheet loads only while the theme is chosen.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one theme, registered with the dock's
  `themes.register` (`src/index.ts`, 29 lines).
- **Code**: that file and a stylesheet of about 170 lines
  (`public/vines.css`). No logic of its own. The entry file is held
  under 2 KB and the stylesheet under 8 KB.
- **Pictures**: 13 SVG files in `public/frames`, about 240 KB together:
  the frame, and for each of the four corners the ivy in summer, its
  autumn leaves, and its bare stems. They are drawn by a script,
  `tools/art/vines` (run `pnpm art:vines` after changing it): the same
  pictures every time, from a fixed seed for each corner. A test fails
  when the files here aren't what the script draws.
- **Third-party code**: none. **Network**: none. **Storage**: none.
- **Tests**: one browser test file (`pnpm playwright test
packages/dock-vines`) that runs the shared theme contract from
  `@modular-av/testing` in every layout and state (contrast, faces left
  clear, every state still shown, nothing moving under reduced motion)
  and checks each state's pictures. The script has unit tests of its
  own: no leaf over a face, nothing outside the frame layer.

## Licence

MIT, artwork included: the pictures in `public/frames` were drawn for this
module by the script in `tools/art/vines`, which is part of this
repository. No image model and no outside artwork went into them.
