# Theming `modular-av-dock`

The dock's look is its default theme, `packages/dock/styles/dock.css`. A
theme restyles it; it never changes what it does. Everything below is the
dock's public API, versioned with the dock: renaming or removing any of it
is a new major version of the dock.

## Registering a theme

A theme is a small Foundry module (`flags["modular-av"].kind = "theme"`,
requiring `modular-av-dock`) that registers itself with the dock's API,
synchronously, inside the dock's hook, which fires once during Foundry's
`setup` (later calls throw):

```js
Hooks.once("modularAVDock.register", (dock) => {
  dock.themes.register({
    id: "vines", // lower case letters, digits, dashes
    label: "my-theme.label", // plain text or an i18n key
    stylesheet: "modules/my-theme/theme.css", // from Foundry's root
    frames: { reach: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 } },
    preview: "modules/my-theme/preview.webp", // optional
    suggestedLayout: "scattered", // optional: docked, floating, scattered
  });
});
```

The API is also `game.modules.get("modular-av-dock").api`. Types for
TypeScript: `@modular-av/dock/themes` in this repository.

- Each player chooses a theme in **Voice & Video Settings → Appearance**,
  or follows the world's theme, which a GM sets there.
- Only the chosen theme's stylesheet loads, so it must not be in the
  module's `styles`: serve it from the module's own files. While it is
  chosen, `<html>` has the class `mav-theme-<id>`; start every rule with
  it (`.mav-theme-vines .mav-dock-tile`, `:root.mav-theme-vines` for
  tokens). The core mirrors the stylesheet and the class into the
  Picture-in-Picture window.
- `suggestedLayout` is offered in the placement menu ("the theme's
  suggestion"); the dock never moves by itself.

## Frames

A frame is artwork around a tile, declared rather than scripted: the
dock gives each tile an empty layer, `.mav-dock-tile-frame`, sized to
`frames.reach` (how far the artwork reaches past the video on each side,
as a fraction of the tile's width, 0 to 0.5: the furthest of all its
variants). The grid fits tiles with room for it, and the scattered
layout keeps it on screen and off Foundry's controls. The theme draws in
that layer and its `::before` and `::after` (an SVG background, or a
9-slice `border-image`), with variants by `[data-anchor]` (the corner or
edge a scattered tile sits against) and by state (`[data-speaking]`,
`[data-muted]`…). A video shape (`clip-path` or `mask-image` on
`.mav-dock-tile-media`) keeps the centre of the picture.

- The frame layer comes before the tile's name, states and buttons: they
  are always drawn over it. It never takes clicks.
- Within 15% of each side of the video at most: inside that margin the
  frame draws nothing (`MAX_FRAME_COVER`).
- `--mav-dock-frame-top`, `-right`, `-bottom`, `-left` (the declared
  reach) and `--mav-dock-frame-across` (1 plus left and right) are set on
  `.mav-dock`.

## Checking a theme

`themeContract()` from `@modular-av/testing/contract/theme` runs, in each
layout a theme names: WCAG AA (axe) for the dock, its popovers and the
settings window; indicators at 3:1 against their tile; every state's
indicator visible and never drawn over by the frame; faces clear; frames
taking no clicks; nothing animated under `prefers-reduced-motion`. See
`packages/dock-vines/test/browser/theme.spec.ts`. Only the dock's own
look has screenshot baselines.

Layouts are the dock's own (docked, floating, scattered, a window of its
own); registering more waits until a module needs it.

## Rules

- **Mute, deafen, speaking, blocked and the connection state, and the
  player's name**, are always shown: restyle indicators, never hide them.
- Faces stay visible: a frame covers at most a margin of the video.
- Text contrast at least 4.5:1 (WCAG AA); icons, rings, borders and focus
  rings at least 3:1 against what they sit on. Focus stays visible.
- Cheap to run: static artwork; animate only `transform` and `opacity`;
  no animation under `prefers-reduced-motion`.
- Video elements stay laid out (`visibility: hidden`, never
  `display: none`): the core pauses videos that aren't on screen and
  needs to see them come back.

## Design tokens

Shared by UI modules (`--mav-*`), set on `:root`:

| Token                                                           | Use                                             |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `--mav-text`, `--mav-text-muted`                                | Text, secondary text                            |
| `--mav-surface`, `--mav-surface-raised`, `--mav-surface-sunken` | Backgrounds                                     |
| `--mav-border`                                                  | Borders                                         |
| `--mav-speaking`                                                | Speaking ring, the meter while the gate is open |
| `--mav-muted`, `--mav-blocked`, `--mav-warning`                 | States                                          |
| `--mav-focus`                                                   | Focus rings                                     |
| `--mav-accent`, `--mav-on-accent`                               | Pressed buttons                                 |
| `--mav-meter`, `--mav-meter-closed`                             | Level meters                                    |

The dock's own (`--mav-dock-*`): `-radius`, `-gap`, `-width` (docked left
or right), `-height` (docked top or bottom), `-tile-bg`, `-ring` (the
speaking ring's width), `-button` (button size), `-font`, `-font-size`,
`-shadow`. `-width` and `-height` are the default size: a player who drags
the docked dock's edge sets their own on `#camera-views`, which wins over
the theme's until they reset it (Home on the grip or a double-click on
the edge), and the dock never takes more than half the window. Set by the
dock on elements: `--mav-dock-columns` and `--mav-dock-tile-width` (the
fitted grid), `--mav-dock-tile-color` (the player's colour),
`--mav-meter-threshold` (0 to 1), `--mav-popover-room`.

## Classes

| Class                                                                                                                                              | Element                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `.mav-dock`                                                                                                                                        | The dock                                                                                                       |
| `.mav-dock-header`, `.mav-dock-status`, `.mav-dock-count`, `.mav-dock-tools`                                                                       | Its title bar                                                                                                  |
| `.mav-dock-tiles`                                                                                                                                  | The list of tiles                                                                                              |
| `.mav-dock-tile`                                                                                                                                   | One player's tile                                                                                              |
| `.mav-dock-tile-media`, `.mav-dock-tile-video`, `.mav-dock-tile-avatar`                                                                            | The video and the avatar under it                                                                              |
| `.mav-dock-tile-frame`                                                                                                                             | An empty layer over the video for frames (no clicks)                                                           |
| `.mav-dock-tile-bar`, `.mav-dock-tile-name`, `.mav-dock-tile-indicators`, `.mav-dock-tile-badges`                                                  | The name and states                                                                                            |
| `.mav-dock-tile-menu`                                                                                                                              | The tile's menu button                                                                                         |
| `.mav-dock-tile-move`, `.mav-dock-tile-resize`                                                                                                     | A scattered tile's handles (hidden in other layouts)                                                           |
| `.mav-dock-edge`, `.mav-dock-edge-grip`                                                                                                            | The docked dock's inner edge and its grip, shown on hover or focus                                             |
| `.mav-dock-panel`, `.mav-dock-buttons`, `.mav-dock-warnings`, `.mav-dock-alert`                                                                    | The voice panel                                                                                                |
| `.mav-dock-button`                                                                                                                                 | Every icon button; `.mav-dock-mute`, `-deafen`, `-video`, `-quick`, `-settings`, `-action`, `-leave` name them |
| `.mav-indicator`                                                                                                                                   | One state's icon                                                                                               |
| `.mav-meter`, `.mav-meter-fill`, `.mav-meter-threshold`                                                                                            | A level meter                                                                                                  |
| `.mav-popover`, `.mav-dock-menu`, `.mav-dock-quick-controls`, `.mav-dock-connection`                                                               | Popovers                                                                                                       |
| `.mav-control`, `.mav-control-switch`, `.mav-control-button`, `.mav-control-nested`, `.mav-control-pictures`, `.mav-control-picture[aria-checked]` | Controls; a choice with pictures (`ChoiceOption.image`) is a radio group of thumbnails                         |
| `.mav-settings`, `.mav-settings-tabbed`                                                                                                            | The settings window; `-tabbed` once it has tabs                                                                |
| `.mav-settings-tabs`, `.mav-settings-tab[data-unsaved]`, `.mav-settings-panel`                                                                     | Its tabs (one with unsaved changes marked) and each tab's content                                              |
| `.mav-settings-section`, `.mav-settings-row`, `.mav-settings-group`, `.mav-settings-hint`, `.mav-settings-actions`                                 | Sections, labelled rows, grouped fields, hints and a row of buttons                                            |
| `.mav-settings-footer`, `.mav-settings-pending`                                                                                                    | The footer: what is unsaved, Reset and Save                                                                    |
| `.mav-call-state`                                                                                                                                  | A player's line saying whether calls are on                                                                    |
| `.mav-effects`, `.mav-effect-choices`, `.mav-effect-choice[aria-pressed]`, `.mav-effect-controls`, `.mav-effect-state`                             | Effects: Off and each effect as buttons, the chosen effect's own controls, its state                           |
| `.mav-sensitivity`, `.mav-sensitivity-head`, `.mav-sensitivity-value`, `.mav-sensitivity-bar`, `.mav-sensitivity-handle`                           | Input sensitivity: the level bar with its threshold handle                                                     |
| `.mav-settings-camera`, `.mav-settings-camera-side`, `.mav-settings-preview`, `.mav-preview-note`, `.mav-preview-only`                             | The camera preview and the note under it                                                                       |
| `.mav-key[data-listening]`                                                                                                                         | Push to talk's key, waiting for a key press while listening                                                    |
| `.mav-players-badges`                                                                                                                              | Badges in Foundry's player list                                                                                |
| `body.modular-av-pip`                                                                                                                              | The Picture-in-Picture window                                                                                  |

## Attributes

States are boolean attributes, so a tile can be speaking and muted at once.

| Attribute                                                                                                                                         | On                                                                | Values                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data-placement`                                                                                                                                  | `.mav-dock`                                                       | `left`, `right`, `top`, `bottom`, `floating`, `scattered`, `window`                                                                                                                                          |
| `data-anchor`                                                                                                                                     | `.mav-dock-tile`, `.mav-dock-panel`                               | scattered only: `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`, `bottom-right`                                                                                                     |
| `data-tile-layout`                                                                                                                                | `.mav-dock`, `.mav-dock-tiles`                                    | `grid`, `focus`                                                                                                                                                                                              |
| `data-collapsed`                                                                                                                                  | `.mav-dock`                                                       | boolean                                                                                                                                                                                                      |
| `data-dragging`, `data-resizing`                                                                                                                  | `.mav-dock`; `data-resizing` also on `#camera-views` while docked | boolean                                                                                                                                                                                                      |
| `data-status`                                                                                                                                     | `.mav-dock-status`                                                | `idle`, `connecting`, `connected`, `waiting`, `reconnecting`, `ended`                                                                                                                                        |
| `data-participant-id`                                                                                                                             | `.mav-dock-tile`                                                  | the Foundry user id                                                                                                                                                                                          |
| `data-speaking`, `data-muted`, `data-deafened`, `data-blocked-audio`, `data-blocked-video`, `data-connected`, `data-hidden-by-me`, `data-focused` | `.mav-dock-tile`                                                  | boolean                                                                                                                                                                                                      |
| `data-video`                                                                                                                                      | `.mav-dock-tile`                                                  | `on`, `off`, `blocked`                                                                                                                                                                                       |
| `data-quality`                                                                                                                                    | `.mav-dock-tile`                                                  | `excellent`, `good`, `poor`, `lost`                                                                                                                                                                          |
| `data-indicator`                                                                                                                                  | `.mav-indicator`                                                  | `muted`, `deafened`, `blocked-audio`, `blocked-video`, `hidden-by-me`, `connection`, `not-connected`, `open-mic`, `speaking-while-muted`, `camera-held`, `microphone-error`, `camera-error`, `effect-failed` |
| `data-contribution`                                                                                                                               | contributed items                                                 | the contribution's id                                                                                                                                                                                        |
| `data-open`                                                                                                                                       | `.mav-meter`                                                      | boolean: the voice gate sends                                                                                                                                                                                |
| `data-speaking`, `data-in-call`                                                                                                                   | Foundry's `li[data-user-id]`                                      | boolean                                                                                                                                                                                                      |
| `aria-pressed`                                                                                                                                    | toggle buttons                                                    | `true` (muted, deafened, camera on)                                                                                                                                                                          |
