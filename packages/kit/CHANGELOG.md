# @modular-av/kit

## 0.6.0

No changes in this release.

## 0.5.0

### Patch Changes

- f5b2bcb: Popovers whose content arrives after they open, such as the connection
  details, are placed again as they grow, so they stay by what opened them
  instead of spilling below it.

## 0.4.0

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 8e37fee: The dock's scattered layout: every camera on its own, against a corner or
  edge of the screen or wherever it is dragged, moved and resized with the
  pointer or the keyboard, saved per player, kept clear of Foundry's
  sidebar, controls, hotbar and chat. A GM can save the arrangement as a
  scene's layout for everyone. Themes: other modules register them through
  the dock's API, each player picks one (or follows the world's), and tile
  frames are declared, so the dock leaves room for them.

### Patch Changes

- 254ff35: Roving focus leaves alone the arrow keys an item used: the floating
  dock's move button moves the dock instead of the focus.

## 0.2.0

No changes in this release.

## 0.1.0

### Minor Changes

- First release of the shared API types, UI helpers and test tooling
  (fake Foundry, mock service, service, UI and effects contracts).
