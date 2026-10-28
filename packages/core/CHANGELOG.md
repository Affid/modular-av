# @modular-av/core

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
