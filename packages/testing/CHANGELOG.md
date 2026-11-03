# @modular-av/testing

## 0.10.1

No changes in this release.

## 0.10.0

### Minor Changes

- b5d9c1d: What works on audio effects only now says so in its name, so nobody builds a
  video effect on it. The audio effects contract moved: `effectContract` is
  `audioEffectContract`, imported from `@modular-av/testing/contract/audio-effects`.
  Registering an effect of an unknown kind, or a video effect with audio fields
  such as `defaultPlace` or `tail`, now throws.
- 5634974: What an audio mixer needs from the core. `commands.setAudioPipeline(change)`
  sets places, order, mix and Channel level at once: checked whole, saved
  together, applied once, with mix checked against the places in the same change.
  `state.local.chosenEffects` lists what a device turned on, in a call or not, and
  `preview.voice()` is a copy of what is sent, to play back to the player.
- 5634974: `modular-av-audio-reverb`, a reverb for the voice channel, on a send by default.
  Its decay can't ring past the 3 s tail it declares, and its settings are control
  contributions. The kit adds `clientNumber`, a per-device number within a range,
  and the audio effects contract now runs hosted effects too.
- b5d9c1d: The core now owns dry:wet. An effect that declares its `latency` gets a
  dry:wet control: the core delays the dry signal to match and mixes the two,
  so the effect outputs only its processed signal. The wet amount of an effect on a send
  works the same way, with `defaultMix` as its start. Players set both, and
  how much of their voice goes out dry, under Voice & Video Settings, Voice,
  Mix. The API adds `commands.setAudioEffectMix`, `commands.setAudioChannelLevel`,
  `LocalState.audioEffectMix` and `LocalState.audioChannelLevel`.
- b5d9c1d: The core now owns where an audio effect runs, and an effect's `defaultPlace` is
  only where it starts. `commands.setAudioEffectPlace` moves an effect, running or
  not, without restarting it, and `commands.setAudioEffectOrder` sets the order within
  a place; both are saved per device and shown in `LocalState.audioEffectPlaces` and
  `LocalState.audioEffectOrder`. The mix control and the tail hold follow the place:
  an effect on a send always has a wet amount, and a tail ahead of Mute no longer
  holds the output open. These are for UI modules to build on; the dock has no
  controls for them yet.
- b5d9c1d: Breaking for effect modules: an audio effect now names a place, not a stage.
  `AudioPlace` replaces `AudioStage`, and `defaultPlace` replaces `stage`.
  `denoise` and `voice` were one place, so both are now `pre-gate`; `post` is
  `post-gate`, and `send` stays. Noise suppression still runs first. The core
  now watches every effect ahead of the gate for stalls, and a stall in a series
  is blamed on the first silent effect, not on what follows it.
- d873ed6: Voice activity mode can now hold the microphone off when its voice gate
  can't run, instead of sending everything as an open mic. Players choose
  it under Voice & Video Settings, Voice, "If voice activity can't run"
  (sending stays the default). The API adds `LocalState.gateFallback`,
  `LocalState.microphoneHold` and `commands.setGateFallback`; the dock
  shows a `microphone-held` warning, and the UI contract checks it.
- b5d9c1d: A worklet effect can now be just a kernel: `AudioEffectContext.host` runs it
  in the core's worklet, which calls `render()` only while there is sound or
  the effect's `tail` is still ringing, so no effect has to write its own early
  return. A kernel that throws or outputs a non-number is reported as failed
  and silenced. `api.createAudioEffectHost` does the same for a context of your own,
  for an effect's tests and previews. See `docs/voice-routing.md`.
- b5d9c1d: The contract for effects after the voice gate now wants wet signal only from
  anything that declares a `tail`, not just from what defaults to `send`, as a
  player can move any effect to a send.
- b5d9c1d: Post effects now run after the voice gate, not before it, so a reverb's
  tail is no longer cut by the gate and no longer holds it open. Such an
  effect now also keeps sounding while the gate is closed, so it must not
  make sound of its own. Mute now closes right after the gate as well as on
  the output, so post-gate effects don't hear what a player says while muted.
- b5d9c1d: A new `send` place for what adds to the voice, like reverb and delay: each
  effect on a send runs in an FX channel of its own, beside the voice, on a
  copy taken after the post-gate effects, and outputs wet signal only. The voice gate now
  drives the sends and the feed of post-gate effects on the audio thread, so
  native effects sleep while nobody speaks (in Firefox, only sends do). The
  core refuses an audio effect in a place it doesn't know.
- b5d9c1d: A new contract for effects after the voice gate,
  `@modular-av/testing/contract/tail-effects`: an effect must cost next to
  nothing on silence, ring no longer than its `tail` says, and, on a send,
  output no dry signal.
- b5d9c1d: While a tail effect runs, a reverb or delay now rings out after a player
  mutes, deafens or lets go of push to talk, for as long as the effect's `tail`,
  at most 3 s. Nothing said after that reaches an effect, so a tail only carries
  what already went out, and a GM's block still ends it at once. Players who
  want the old behaviour turn on "Cut reverb and delay when my microphone
  closes" under Voice, Mix. The API adds `LocalState.audioCutTails` and
  `commands.setAudioCutTails`.

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

- Updated dependencies [363768a]
  - @modular-av/api@0.6.0

## 0.5.0

### Minor Changes

- fda84f1: For module authors: `api.preview.camera(element, { device, effect })` and
  `api.preview.microphone(element, { device, listener })` preview a device
  outside the call, and stop when asked or when the element goes. A
  contributed control can name the `effect` it belongs to, and is shown
  under that effect when it is chosen; a settings section can name its
  `tab` (`"call"`, `"voice"`, `"video"` or `"appearance"`).

  Camera background's strength and picture now show under Blur and Replace
  themselves, instead of in a section of their own.

  The testing package's fake Foundry holds the world's A/V settings as
  `core.rtcWorldSettings`, as Foundry does, and fakes the previews.

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

- First release of the shared API types, UI helpers and test tooling
  (fake Foundry, mock service, service, UI and effects contracts).

### Patch Changes

- Updated dependencies
  - @modular-av/api@0.1.0
