# @modular-av/livekit-krisp

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.1

No changes in this release.

## 0.10.0

### Minor Changes

- b5d9c1d: Breaking for effect modules: an audio effect now names a place, not a stage.
  `AudioPlace` replaces `AudioStage`, and `defaultPlace` replaces `stage`.
  `denoise` and `voice` were one place, so both are now `pre-gate`; `post` is
  `post-gate`, and `send` stays. Noise suppression still runs first. The core
  now watches every effect ahead of the gate for stalls, and a stall in a series
  is blamed on the first silent effect, not on what follows it.

## 0.9.1

### Patch Changes

- @modular-av/api@0.9.1

## 0.9.0

### Patch Changes

- @modular-av/api@0.9.0

## 0.8.2

### Patch Changes

- @modular-av/api@0.8.2

## 0.8.1

### Patch Changes

- @modular-av/api@0.8.1

## 0.8.0

### Patch Changes

- @modular-av/api@0.8.0

## 0.7.0

### Patch Changes

- @modular-av/api@0.7.0

## 0.6.0

### Patch Changes

- 363768a: "Plan your modules" is now a signal chain of cards. On air shows what
  the world runs; Next is the setup you build, in the order a call flows:
  effects, the service, the cameras and the Dock's theme. Open a stage to
  see its modules as tiles, each with what it is for and one action; a
  world with no service starts from three common builds. Load in, Go live
  and Soundcheck walk you to Foundry's Setup screen and back, and
  Soundcheck opens each module's settings where they live.

  For module authors: the Voice & Video Settings window can open on a tab
  (`SettingsHost.tab`, a `SettingsWindowTab`; while it is open,
  `SettingsHost.onTabRequest` tells the surface, which keeps what is
  drafted), its code loads when it first opens, and each module's manifest
  can give its card an icon and a few facts (`flags["modular-av"].icon`
  and `.facts`).

- Updated dependencies [363768a]
  - @modular-av/api@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [fda84f1]
  - @modular-av/api@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [be36f7d]
  - @modular-av/api@0.4.0

## 0.3.1

### Patch Changes

- @modular-av/api@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [8e37fee]
  - @modular-av/api@0.3.0

## 0.2.0

### Patch Changes

- No changes of its own: released alongside `modular-av-jitsi`, since
  every module shares one version until 1.0.

## 0.1.0

### Minor Changes

- LiveKit Cloud's Krisp noise filter as a noise cancellation choice, loaded
  from npm when turned on. Held back from releases for now.

### Patch Changes

- Updated dependencies
  - @modular-av/api@0.1.0
