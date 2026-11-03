# @modular-av/audio-echo

## 0.10.0

### Minor Changes

- 5634974: `modular-av-audio-echo`, an echo for the voice channel, on a send by default.
  Its feedback comes from its decay, counted from the first repeat, so no setting
  rings past the 3 s tail it declares.

### Patch Changes

- Updated dependencies [5634974]
  - @modular-av/kit@0.10.0
