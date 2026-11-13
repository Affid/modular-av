# @modular-av/audio-radio

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

### Minor Changes

- fd11b06: `modular-av-audio-radio`, a walkie-talkie for the voice channel, after the voice
  gate by default: a 300 Hz to 3 kHz band, drive into soft clipping, static that
  follows the voice, and a burst of squelch when the gate closes or push to talk
  is released. Everything it makes ends within the 0.3 s tail it declares.

### Patch Changes

- @modular-av/kit@0.11.0
