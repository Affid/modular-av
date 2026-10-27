# Milestone 9 plan: the scattered layout and `modular-av-dock-vines`

Drafted on 2026-10-27 at the end of milestone 8, from `docs/HANDOFF.md`
(§1, §3 "`modular-av-dock`: themes and layouts" and "Testing per module",
§9 item 9, §13 milestone 5 findings, §17 open items) and the dock's code.
**Approved on 2026-10-27** with every recommendation, and with the
findings below, which change parts of it.

## Findings from checking the plan against the code (2026-10-27)

- **Scattered is a placement, not a tile layout**: grid and focus fit
  tiles inside the dock's box; scattered has no box. It sits in the
  placement menu beside left, right, top, bottom, floating and its own
  window, asks the host for `free`, and is marked
  `data-placement="scattered"`; the `mode` setting gains `"scattered"`.
- **No header in scattered**: the header holds the session status, the
  placement menu and the grid/focus toggle. The voice panel element
  carries the status and the placement menu there (the UI contract needs
  a visible `[data-status]` and every command reachable).
- **The chat stays clear too**: with the sidebar collapsed, Foundry v14
  puts the chat input and recent messages in `#chat-notifications`
  inside `#ui-right-column-1`.
- **The scene**: with `core.noCanvas` (the Foundry suite) no scene is
  viewed and `game.scenes.current` is null; the dock uses
  `game.scenes.viewed ?? game.scenes.active`. The test world has no
  scenes: the spec makes and activates one.
- **Theme checks move** from `packages/dock/test/browser/theme.spec.ts`
  into `@modular-av/testing` as a theme contract, reading the real tile
  background instead of the default theme's.
- **The harness** registers every module it loads in the fake world (so
  `game.modules.get("modular-av-dock").api` exists there) and takes
  `?theme=`.
- **A theme's stylesheet** lives in its `public/` (never in
  `module.json` `styles`, or Foundry would always load it); the size
  check gets a budget for it.
- **Font Awesome**: Foundry 14.369 ships Pro 7.2.0; the harness pins
  `@fortawesome/fontawesome-free@7.2.0`.
- **The GM's block switch** reads `canBroadcast` and shows "blocked"
  where the world's mode disallows the kind; it moves to the new
  `blockedAudio`/`blockedVideo` too.
- **Left out**: HANDOFF's "optional slots" for themes. The theme picker
  is in the dock's settings window; `suggestedLayout` is offered, never
  applied by itself. A new module needs `pnpm foundry:link`, a Foundry
  restart and `setup-world`.

## Decisions (2026-10-27)

1. The voice panel in scattered is its own element (mute, deafen,
   camera, quick controls, settings, leave, the status and the placement
   menu), placed like a tile, bottom-left above the hotbar by default.
2. A scene's saved layout is what players see there until a player moves
   a tile on it; then theirs wins for that scene, with "back to the
   scene's layout" in the menu.
3. Layouts behind an internal interface; `layouts.register` only when a
   module needs it. `themes.register` is public.
4. No compact tile layout in milestone 9.
5. Approved: `@fortawesome/fontawesome-free@7.2.0` (dev only) and the
   core fields `ParticipantState.blockedAudio`/`blockedVideo`.

## Where the dock stands

- **Placements**: docked left, right, top or bottom; floating (moved,
  resized, kept on screen, saved per player); or its own
  Picture-in-Picture window (`packages/dock/src/cameras/placement.ts`).
- **Tile layouts**: `grid` (16:9 tiles as large as fit) and `focus`
  (`cameras/tiles.ts`, `kit`'s `fitGrid`/`fitFocus`).
- **Theming today**: the documented tokens, classes and `data-*`
  attributes (`docs/dock-theming.md`), plus an empty
  `.mav-dock-tile-frame` layer for frames. There is no way yet to
  register or choose a theme.
- **Settings**: `mode`, `floatingRect`, `tileLayout`, `collapsed`, all
  `user` scope (`packages/dock/src/settings.ts`).
- **Budgets**: the dock's entry is about 52 of 80 KB, its CSS about 14 of
  40 KB.
- **Foundry v14 interface ids** (from `templates/views/game.hbs`):
  `#interface`, `#ui-left`, `#ui-middle`, `#ui-right`, `#ui-top`,
  `#ui-bottom`, `#sidebar`, `#scene-controls`, `#hotbar`, `#players`,
  `#scene-navigation`, `#camera-views`.

## What milestone 9 builds

### 0. Prep

- **Font Awesome in the test harness only**, so the dock's screenshot
  baselines show their icons and theme checks such as "indicators
  visible" are meaningful: `@fortawesome/fontawesome-free` (code MIT,
  fonts OFL-1.1, icons CC BY 4.0), a dev dependency, never shipped
  (Foundry already brings Font Awesome). Regenerate the dock's baselines.
- **A core field for "blocked by a GM"** (additive API, committed with
  its core implementation and tests): `ParticipantState.blockedAudio` and
  `blockedVideo`, true only where the world's mode allows the kind. The
  dock uses it instead of working it out from `worldMode` and
  `canBroadcast` (§13); a theme or another UI gets it for free.

### 1. The scattered layout (in the dock, chosen like grid or focus)

- Every camera is its own element, anchored to a corner or edge
  (top-left, top, top-right, left, right, bottom-left, bottom,
  bottom-right) or dragged anywhere; tiles resize; arrow keys move them
  as well as the pointer.
- Position and size saved per player (`user` scope) as an anchor plus an
  offset, so they survive window resizes; saved values that are broken
  give the defaults.
- Foundry's controls stay clear: the sidebar, scene controls, hotbar,
  players list and scene navigation are measured live; tiles (with any
  frame overflow) are pushed out of them, again when the sidebar
  collapses or opens and when the window resizes.
- New players get the next free anchor slot.
- **Per scene, when a GM wants**: a GM saves the current arrangement as
  the scene's layout (a scene flag, which players read and only GMs
  write). See question 2.
- **The voice panel** becomes a small element of its own (question 1).
- Kept from the dock: the tile code (states, menus, meters,
  contributions), `kit`'s drag and keep-on-screen. Videos stay laid out
  (`visibility: hidden`, never `display: none`), as the core requires.
- Built behind an internal layout interface (question 3).

### 2. Themes (the dock's own API, versioned with the dock)

- `game.modules.get("modular-av-dock").api.themes.register({ id, label,
stylesheet, frames?, preview?, suggestedLayout? })`, synchronous in a
  hook during setup, like the core's registries (a clear error for late
  registration).
- Each player picks a theme (`user` scope), with a default the GM sets
  (`world`). The dock loads only the chosen theme's stylesheet (the core
  already mirrors page stylesheets into the Picture-in-Picture window)
  and marks its elements `data-mav-theme="<id>"`; themes write their
  selectors under that attribute.
- **Frames, declared, not scripted**: artwork (SVG, or a 9-slice image
  for `border-image`), how far it reaches past the video on each side
  (fitting and the scattered layout's clamping allow for it), an
  optional video shape (`clip-path`/`mask`), variants per anchor or per
  state. Frames never take clicks.
- **Rules checked automatically**: indicators visible in every state,
  contrast (axe), faces not covered (a frame covers at most a set margin
  of the video, checked from its declaration and on screen), nothing
  animated under `prefers-reduced-motion`. Screenshot baselines only for
  the default theme (§3 "Testing per module").

### 3. `modular-av-dock-vines` (new theme module)

- `packages/dock-vines`, `flags["modular-av"].kind = "theme"`, requires
  `modular-av-dock`.
- Vine-leaf frames, original SVG drawn for this module (no licence
  question): leaves grow from the corner a tile sits in, a soft glow
  while speaking, greyed while muted. Suggests the scattered layout. Its
  tokens give a green palette that passes AA contrast.
- A tiny entry (the registration), a CSS file and the SVGs.

### 4. Tests

- **Unit**: the placement maths (anchors, clamping, avoiding Foundry's
  controls, frame overflow), broken saved values, the theme registry,
  scene layouts.
- **Browser harness**: the scattered layout (drag, keyboard, anchors,
  resize); the UI contract in the scattered layout (every required state
  visible, every command reachable by mouse and keyboard); the theme
  checks with dock-vines; the chosen theme's styles follow the dock into
  the Picture-in-Picture window.
- **Foundry suite**: scattered tiles stay clear of the sidebar and
  hotbar and follow the sidebar's collapse; a GM's scene layout reaches a
  player; choosing a theme loads only its stylesheet.

### 5. Docs

`docs/dock-theming.md` (registering themes, frames, the scattered
layout's hooks), the dock and dock-vines READMEs, HANDOFF findings (§18,
open items renumbered after it), a changeset.

## Questions for the owner (answer before coding)

1. **The voice panel in the scattered layout.** Recommended: its own small
   element (mute, deafen, camera, quick controls, settings), placed like a
   tile, anchored bottom-left above the hotbar by default, movable.
   Alternative: no panel (the player-list menu and keybindings only), not
   recommended.
2. **Scene layouts.** Recommended: a scene's layout, when the GM saved
   one, is what players see on that scene; once a player moves a tile
   there, their own arrangement wins for that scene, with "back to the
   scene's layout" in the menu. Alternative: the scene's layout always
   wins.
3. **`dock.layouts.register`.** Recommended: the scattered layout built
   behind an internal layout interface; `layouts.register` published only
   when another module needs it (no layout module is planned, and a
   public API shaped by one layout would likely break later).
   `themes.register` is public in milestone 9, proven by dock-vines.
4. **The compact tile layout** (avatars and names only, left from
   milestone 5). Recommended: left out of milestone 9, unless wanted.
5. **Approvals**: the dev dependency `@fortawesome/fontawesome-free`
   (tests only); the additive core fields `blockedAudio`/`blockedVideo`.

Out of scope unless the owner says so: `modular-av-tokens`, the external
call mode (`modular-av-embed`), the other open items in HANDOFF §17.

## Working rules (as in earlier milestones)

A branch (`m9-scattered`), test first, small conventional commits,
`pnpm verify` green before each commit (read its exit code in its own
step, never chained with the commit), code and security reviews before
merging, `pnpm test:services` and `pnpm test:foundry` for anything that
touches media or the session (the dock is UI: `pnpm test:foundry` for
the dock and theme specs). Ask before pushing, releasing, adding
dependencies, or starting Docker servers not run before.
