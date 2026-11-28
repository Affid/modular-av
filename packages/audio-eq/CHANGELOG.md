# @modular-av/audio-eq

## 0.16.1

### Patch Changes

- @modular-av/kit@0.16.1

## 0.16.0

### Patch Changes

- 771ccf0: Each voice effect now recommends the audio mixer, so Foundry offers the
  mixer when you install or enable the effect. Until now nothing pointed
  to it, and without the mixer players had no way to turn an effect on.
  The effects still don't require the mixer: another module can turn them
  on through the core's API.
- @modular-av/kit@0.16.0

## 0.15.0

### Patch Changes

- @modular-av/kit@0.15.0

## 0.14.1

### Patch Changes

- @modular-av/kit@0.14.1

## 0.14.0

### Patch Changes

- @modular-av/kit@0.14.0

## 0.13.2

### Patch Changes

- @modular-av/kit@0.13.2

## 0.13.1

### Patch Changes

- @modular-av/kit@0.13.1

## 0.13.0

### Patch Changes

- @modular-av/kit@0.13.0

## 0.12.0

### Minor Changes

- 21186e7: A player's setup follows them to another address or browser. Modules
  declare where each setting is kept through the core's new `api.settings`:
  `"player"` (Foundry's user scope, on the server) or `"device"` (this
  browser). The voice effects a player turns on and how they run (places,
  order, levels), the effects' values, the camera background's strength and
  image, the mixer's preset, the mic boost's Even out and their volumes for
  the others are the player's. Microphone sensitivity, the gate fallback, the
  camera's resolution, the mic boost's level, camera effects, blur and Krisp
  quality and devices stay with the device. When the game is ready,
  what a browser kept before moves to the player once, unless the player
  already has their own, so nobody loses their setup on the update. The kit's
  `clientNumber` became `savedNumber`, which takes the storage.

### Patch Changes

- Updated dependencies [21186e7]
  - @modular-av/kit@0.12.0

## 0.11.0

### Patch Changes

- @modular-av/kit@0.11.0

## 0.10.1

### Patch Changes

- The module builder says a GM can change the table's voices from the audio
  mixer, and EQ's card has its own icon instead of the mixer's.
- @modular-av/kit@0.10.1

## 0.10.0

### Minor Changes

- 5634974: `modular-av-audio-eq`, a three band equalizer for the voice channel, ahead of the
  voice gate by default, on the browser's own filters.

### Patch Changes

- Updated dependencies [5634974]
  - @modular-av/kit@0.10.0
