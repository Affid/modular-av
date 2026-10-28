# @modular-av/dock

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
  - @modular-av/kit@0.6.0

## 0.5.0

### Minor Changes

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

### Patch Changes

- d6bd349: Input sensitivity is set on the level bar itself, as in Discord: your
  level fills the bar (green while you're heard) and the threshold is a
  handle on the same scale, its value in dB beside it. With "Set it
  automatically" on, the handle goes and the bar shows the gate's own
  threshold. The slider and the meter used to sit apart on different
  scales, with no value shown.
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

- Connection details, readable and in the voice panel as in Discord: the
  panel opens with your connection (signal bars, round trip, service and
  path, or Reconnecting). A click shows the round trip over the last
  minute, your numbers and every player's link; a player's menu shows
  their link with a Details button. They used to sit in a menu, cut off.
- A scattered camera follows the pointer and stays where it's dropped: it
  no longer flickers back to its old spot mid-drag, nor saves that spot.
  Docked on the right, the dock stays above Foundry's collapsed sidebar
  instead of hiding under it.
- @modular-av/api@0.3.1
  - @modular-av/kit@0.3.1

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
