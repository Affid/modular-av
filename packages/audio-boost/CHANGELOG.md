# @modular-av/audio-boost

## 0.12.0

### Minor Changes

- 5e01a9a: `modular-av-audio-boost`, a mic boost for the voice channel, ahead of the voice
  gate by default: up to 24 dB of gain, a compressor that evens out loud moments
  (its "Even out" setting), and a limiter just under full scale so a boosted
  shout can't clip. It uses the browser's own nodes.
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
