# @modular-av/audio-reverb

## 0.10.1

### Patch Changes

- @modular-av/kit@0.10.1

## 0.10.0

### Minor Changes

- 5634974: `modular-av-audio-reverb`, a reverb for the voice channel, on a send by default.
  Its decay can't ring past the 3 s tail it declares, and its settings are control
  contributions. The kit adds `clientNumber`, a per-device number within a range,
  and the audio effects contract now runs hosted effects too.

### Patch Changes

- Updated dependencies [5634974]
  - @modular-av/kit@0.10.0
