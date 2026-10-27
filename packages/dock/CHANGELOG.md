# @modular-av/dock

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

- 33c6e7c: Buttons the dock hides stay hidden in Foundry: the move button no
  longer shows while docked, nor reconnect while connected, nor an empty
  Effects section in the settings window.
- 22d9304: A GM's block switches no longer show "blocked" for a kind the world's
  mode leaves out.
- bd56bf7: With a theme's frames, the docked grid no longer flips between two
  tile sizes.
- Updated dependencies [8e37fee]
- Updated dependencies [8e37fee]
  - @modular-av/api@0.3.0
  - @modular-av/kit@0.3.0

## 0.2.0

### Patch Changes

- No changes of its own: released alongside `modular-av-jitsi`, since
  every module shares one version until 1.0.

## 0.1.0

### Minor Changes

- First release. The Discord-like camera dock (docked, floating or in a
  window of its own), voice panel, voice and video settings window and
  player list badges; it shows the effects and controls other modules add,
  choices with pictures as thumbnails. A player's dock layout from LiveKit
  AVClient comes along once.

### Patch Changes

- Updated dependencies
  - @modular-av/api@0.1.0
  - @modular-av/kit@0.1.0
