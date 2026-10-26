# Theming `modular-av-dock`

The dock's look is its default theme, `packages/dock/styles/dock.css`. A
theme restyles it; it never changes what it does. Everything below is the
dock's public API, versioned with the dock: renaming or removing any of it
is a new major version of the dock.

Registering themes (`dock.themes.register`) and layouts
(`dock.layouts.register`) comes with the first theme and the scattered
layout (milestone 9). Until then a theme module adds a stylesheet that
sets tokens or restyles these hooks.

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
`-shadow`. Set by the dock on elements: `--mav-dock-columns` and
`--mav-dock-tile-width` (the fitted grid), `--mav-dock-tile-color` (the
player's colour), `--mav-meter-threshold` (0 to 1), `--mav-popover-room`.

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
| `.mav-dock-panel`, `.mav-dock-buttons`, `.mav-dock-warnings`, `.mav-dock-alert`                                                                    | The voice panel                                                                                                |
| `.mav-dock-button`                                                                                                                                 | Every icon button; `.mav-dock-mute`, `-deafen`, `-video`, `-quick`, `-settings`, `-action`, `-leave` name them |
| `.mav-indicator`                                                                                                                                   | One state's icon                                                                                               |
| `.mav-meter`, `.mav-meter-fill`, `.mav-meter-threshold`                                                                                            | A level meter                                                                                                  |
| `.mav-popover`, `.mav-dock-menu`, `.mav-dock-quick-controls`, `.mav-dock-connection`                                                               | Popovers                                                                                                       |
| `.mav-control`, `.mav-control-switch`, `.mav-control-button`, `.mav-control-nested`, `.mav-control-pictures`, `.mav-control-picture[aria-checked]` | Controls; a choice with pictures (`ChoiceOption.image`) is a radio group of thumbnails                         |
| `.mav-settings`, `.mav-settings-section`, `.mav-settings-row`                                                                                      | The settings window                                                                                            |
| `.mav-players-badges`                                                                                                                              | Badges in Foundry's player list                                                                                |
| `body.modular-av-pip`                                                                                                                              | The Picture-in-Picture window                                                                                  |

## Attributes

States are boolean attributes, so a tile can be speaking and muted at once.

| Attribute                                                                                                                                         | On                             | Values                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data-placement`                                                                                                                                  | `.mav-dock`                    | `left`, `right`, `top`, `bottom`, `floating`, `window`                                                                                                                                                       |
| `data-tile-layout`                                                                                                                                | `.mav-dock`, `.mav-dock-tiles` | `grid`, `focus`                                                                                                                                                                                              |
| `data-collapsed`                                                                                                                                  | `.mav-dock`                    | boolean                                                                                                                                                                                                      |
| `data-dragging`, `data-resizing`                                                                                                                  | `.mav-dock`                    | boolean                                                                                                                                                                                                      |
| `data-status`                                                                                                                                     | `.mav-dock-status`             | `idle`, `connecting`, `connected`, `waiting`, `reconnecting`, `ended`                                                                                                                                        |
| `data-participant-id`                                                                                                                             | `.mav-dock-tile`               | the Foundry user id                                                                                                                                                                                          |
| `data-speaking`, `data-muted`, `data-deafened`, `data-blocked-audio`, `data-blocked-video`, `data-connected`, `data-hidden-by-me`, `data-focused` | `.mav-dock-tile`               | boolean                                                                                                                                                                                                      |
| `data-video`                                                                                                                                      | `.mav-dock-tile`               | `on`, `off`, `blocked`                                                                                                                                                                                       |
| `data-quality`                                                                                                                                    | `.mav-dock-tile`               | `excellent`, `good`, `poor`, `lost`                                                                                                                                                                          |
| `data-indicator`                                                                                                                                  | `.mav-indicator`               | `muted`, `deafened`, `blocked-audio`, `blocked-video`, `hidden-by-me`, `connection`, `not-connected`, `open-mic`, `speaking-while-muted`, `camera-held`, `microphone-error`, `camera-error`, `effect-failed` |
| `data-contribution`                                                                                                                               | contributed items              | the contribution's id                                                                                                                                                                                        |
| `data-open`                                                                                                                                       | `.mav-meter`                   | boolean: the voice gate sends                                                                                                                                                                                |
| `data-speaking`, `data-in-call`                                                                                                                   | Foundry's `li[data-user-id]`   | boolean                                                                                                                                                                                                      |
| `aria-pressed`                                                                                                                                    | toggle buttons                 | `true` (muted, deafened, camera on)                                                                                                                                                                          |
