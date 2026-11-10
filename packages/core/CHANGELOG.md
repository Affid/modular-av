# @modular-av/core

## 0.12.0

### Minor Changes

- 5e01a9a: `modular-av-audio-boost`, a mic boost for the voice channel, ahead of the voice
  gate by default: up to 24 dB of gain, a compressor that evens out loud moments
  (its "Even out" setting), and a limiter just under full scale so a boosted
  shout can't clip. It uses the browser's own nodes.
- a1e7d21: Players can raise their camera's resolution, for this device: the
  browser's choice (as before, usually 640x480), 360p, 720p or 1080p, under
  Voice & Video Settings, Video, "Resolution". The camera is asked for that
  size, never forced to it, so a camera that can't do it opens at the
  nearest size it has. A running camera is captured again at once, after
  letting the old capture go, since Chrome keeps a camera that is still open
  at its size. The settings window's preview shows the chosen size and lets
  the camera go while a new size is saved, so it can't keep the call's camera
  small. The API adds `VideoResolution`, `LocalState.videoResolution`,
  `commands.setVideoResolution` (resolved once the camera runs at the new
  size) and a camera preview's `resolution`; the service contract checks
  that a camera captured again at a larger size arrives larger. Jitsi is told
  a video effect's camera at the size of its frames, which follow the
  resolution, instead of always 640x480.
- 7285fb1: The dock opens in a normal window of its own, which can be dragged to
  another monitor and go full screen (a button in its header), in every
  browser. Picture-in-Picture stays as "In a window always on top", in Chrome
  and Edge; browsers don't let it go full screen. A window closes with
  Foundry's page. The API adds `windows.popup` beside `windows.pip`, both
  `PageWindows` (`PipWindow` and its kin stay as names for the same types);
  the UI contract checks "a window of its own" against the popup, and the
  window always on top for a UI that offers it (`UIDriver.openOnTop`).
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
- 5e01a9a: A quiet player can be boosted: the volume in a participant's menu goes up to
  200%, for this client, and is remembered like the volume was. Above 100% the
  core plays them through Web Audio and a limiter just under full scale, so the
  boost can't clip; its code loads with the first boost. Until the browser lets
  that audio run (a page loaded without a click may have to wait for one), they
  play at 100%. `commands.setVolume` takes 0 to 2.

### Patch Changes

- Updated dependencies [a1e7d21]
- Updated dependencies [7285fb1]
- Updated dependencies [21186e7]
- Updated dependencies [5e01a9a]
  - @modular-av/api@0.12.0
  - @modular-av/kit@0.12.0

## 0.11.0

### Minor Changes

- fd11b06: `modular-av-audio-radio`, a walkie-talkie for the voice channel, after the voice
  gate by default: a 300 Hz to 3 kHz band, drive into soft clipping, static that
  follows the voice, and a burst of squelch when the gate closes or push to talk
  is released. Everything it makes ends within the 0.3 s tail it declares.

### Patch Changes

- @modular-av/api@0.11.0
  - @modular-av/kit@0.11.0

## 0.10.1

### Patch Changes

- The module builder says a GM can change the table's voices from the audio
  mixer, and EQ's card has its own icon instead of the mixer's.
- 9d64bdf: Module links posted to the chat wrap to the chat's width. A long manifest
  URL used to be cut off at the edge of the message, so it couldn't be read
  or copied whole.
- @modular-av/api@0.10.1
  - @modular-av/kit@0.10.1

## 0.10.0

### Minor Changes

- 5634974: `modular-av-audio-echo`, an echo for the voice channel, on a send by default.
  Its feedback comes from its decay, counted from the first repeat, so no setting
  rings past the 3 s tail it declares.
- 5634974: `modular-av-audio-eq`, a three band equalizer for the voice channel, ahead of the
  voice gate by default, on the browser's own filters.
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
- b5d9c1d: The stall watchdog now also watches effects after the gate, each against
  what it hears, and takes out any effect whose level runs away or stops being
  a number. `AudioEffectDefinition.tail` says how long an effect keeps
  sounding, so a long delay isn't taken for stalled before its first echo.
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
- b5d9c1d: While a tail effect runs, a reverb or delay now rings out after a player
  mutes, deafens or lets go of push to talk, for as long as the effect's `tail`,
  at most 3 s. Nothing said after that reaches an effect, so a tail only carries
  what already went out, and a GM's block still ends it at once. Players who
  want the old behaviour turn on "Cut reverb and delay when my microphone
  closes" under Voice, Mix. The API adds `LocalState.audioCutTails` and
  `commands.setAudioCutTails`.
- 5634974: `preview.voice()` now hears through Mute and the push to talk key for as long
  as its track is live, so a muted player can test their voice; what is sent
  still follows Mute, so the table hears nothing. Before, the copy was silent
  while muted.

### Patch Changes

- 5634974: Turning a noise model on no longer turns off echo cancellation in Chrome. The
  microphone was opened again before the old capture closed, and Chrome then
  gave the raw device, so a player on speakers could hear the call loop.
- 5634974: A long held note no longer closes the voice gate. In voice activity mode with
  automatic sensitivity, a steady note could be taken for background noise and
  cut after 5 to 15 seconds. The cost is that a loud steady noise starting during
  a call now takes over 30 seconds to be learned, instead of 5 to 12.
- Updated dependencies [6ff0f49]
- Updated dependencies [b5d9c1d]
- Updated dependencies [5634974]
- Updated dependencies [5634974]
- Updated dependencies [b5d9c1d]
- Updated dependencies [b5d9c1d]
- Updated dependencies [b5d9c1d]
- Updated dependencies [b5d9c1d]
- Updated dependencies [d873ed6]
- Updated dependencies [b5d9c1d]
- Updated dependencies [b5d9c1d]
- Updated dependencies [b5d9c1d]
- Updated dependencies [b5d9c1d]
- Updated dependencies [5634974]
  - @modular-av/api@0.10.0
  - @modular-av/kit@0.10.0

## 0.9.1

### Patch Changes

- 7b8b042: "Plan your modules" opens fully on the screen: it was centred while still
  empty and grew down past the bottom as the board filled in, then jumped
  back on the first click. It is now centred again as its content grows,
  until you move it (the settings window shares the same code). Soundcheck
  names other modules' settings sections ("Camera background") instead of
  showing their text keys.
- @modular-av/api@0.9.1
  - @modular-av/kit@0.9.1

## 0.9.0

### Patch Changes

- @modular-av/api@0.9.0
  - @modular-av/kit@0.9.0

## 0.8.2

### Patch Changes

- a0927e3: "Plan your modules": a step clicked open (Go live, say) no longer keeps
  Foundry's focus ring around its header, which looked like a card inside
  the card. The keyboard's focus still shows.
- Updated dependencies [d8756e8]
  - @modular-av/kit@0.8.2
  - @modular-av/api@0.8.2

## 0.8.1

### Patch Changes

- b531ac1: Fixes from playing with 0.8.0:

  - The camera background's pictures show as proper thumbnails (Foundry's
    button height squeezed them), and the menus no longer scroll sideways.
  - The arrow beside the microphone or the camera looks pressed, its
    chevron turned, while its menu is open.
  - The dock's tooltips open away from its row of buttons (above the voice
    panel at the bottom of the screen, beside the collapsed rail), and a
    click takes the tooltip down so it doesn't sit over the menu it opened.
  - A player's connection details open by their tile, not by the voice
    panel, which may be far away in the scattered layout.
  - The settings window opens in the middle of the screen: it was placed
    for its first, still empty content and grew downwards from there.
  - A tile's menu loads the first time it opens, which keeps the dock's
    first load smaller.

- @modular-av/api@0.8.1
  - @modular-av/kit@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [67d5dd3]
  - @modular-av/kit@0.8.0
  - @modular-av/api@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [e603289]
  - @modular-av/kit@0.7.0
  - @modular-av/api@0.7.0

## 0.6.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [363768a]
  - @modular-av/api@0.6.0
  - @modular-av/kit@0.6.0

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

- 1301827: The Voice & Video Settings window has tabs (Call, Voice, Video,
  Appearance, and More for other modules' settings that name no tab) and is
  wider. Nothing changes until Save: the footer says what is unsaved and
  whether saving reloads the page, and Reset puts everything back.

  - Call: a GM turns calls off or on, picks the service and the relay
    server here, without Foundry's own window. A player sees whether calls
    are on.
  - Voice: push to talk's key is set in place (click, then press the key);
    voice activity shows the microphone's level as you speak, even outside
    a call.
  - Video: a preview of your camera, with the background effect you drafted,
    even outside a call.
  - Each effect group is one control: Off and its effects as buttons (a
    list when there are more than two), with the chosen effect's own
    settings under it. The quick controls use it too.
  - Appearance: a GM picks one theme, for everyone; a player sees "As the
    GM chose" and can pick their own.

- Updated dependencies [f5b2bcb]
- Updated dependencies [fda84f1]
  - @modular-av/kit@0.5.0
  - @modular-av/api@0.5.0

## 0.4.0

### Minor Changes

- be36f7d: Plan your modules: GMs open an assembly board from the core's module
  settings or the Voice & Video Settings window. Every Modular A/V module
  is a piece: put the service, the cameras and the effects you want on the
  board; it gives the fewest links to install on Foundry's Setup screen
  (copy them, save a file or whisper them to yourself), then turns modules
  on and off for the world, never leaving it without its running service.
  Updates and new modules come from the family's catalog on GitHub (a
  world setting turns asking GitHub off). With no service enabled, a GM is
  told which exist; the settings window says the effects are modules of
  their own. Installing a module now offers what it needs: every family
  relationship carries its manifest URL, and the core recommends only the
  dock. `SettingsHost.openModules()` is new in the API.

### Patch Changes

- Updated dependencies [be36f7d]
  - @modular-av/api@0.4.0
  - @modular-av/kit@0.4.0

## 0.3.1

### Patch Changes

- The Voice & Video Settings window fits the screen, scrolls when its
  sections are taller, and can always be moved.
- @modular-av/api@0.3.1

## 0.3.0

### Minor Changes

- 8e37fee: `ParticipantState.blockedAudio` and `blockedVideo`: a GM took away a kind
  the world's mode allows. UIs no longer work it out from `worldMode` and
  `canBroadcast`.

### Patch Changes

- 17d2efd: A cameras UI that starts floating or scattered after a reload places
  itself again: the core asked Foundry's hotbar to make room before the
  hotbar had rendered, and Foundry threw.
- Updated dependencies [8e37fee]
  - @modular-av/api@0.3.0

## 0.2.0

### Minor Changes

- A service can ask for a fresh token while connected
  (`ServiceConnection.updateToken`, answered through the GM relay), so a
  long call over Jitsi stays up after its first token runs out.

## 0.1.0

### Minor Changes

- First release. Replaces Foundry's A/V client and runs the call over the
  service module the GM picks (LiveKit or P2P), shown by Foundry's camera
  dock or a module's. Mute applies to what is sent in every state of the
  connection, GM blocks are enforced by every browser, camera effects fail
  closed, and it reconnects by itself. Its own voice gate drives voice
  activity, push to talk uses Foundry's key, and it warns when you speak
  while muted. A player's input sensitivity from LiveKit AVClient comes
  along once.

### Patch Changes

- Updated dependencies
  - @modular-av/api@0.1.0
