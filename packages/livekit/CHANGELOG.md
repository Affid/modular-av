# @modular-av/livekit

## 0.13.2

No changes in this release.

## 0.13.1

No changes in this release.

## 0.13.0

### Minor Changes

- 7ec3bac: Players can share a screen, a window or a browser tab beside their
  camera, from a button in the dock's voice panel. A tab's sound goes too
  where the browser offers it (Chrome, Edge); the whole system's sound is
  left out, since it would send the call's own voices back. LiveKit and P2P
  carry the share's sound; Jitsi carries the picture only, since it sends
  one sound track per player. A share is captured at up to 1080 lines and
  15 frames a second, tuned for text and maps, and shows in a tile of its
  own after the player's camera, whole rather than cropped. A new world
  setting, "Who may share their screen", lets everyone who may send video
  share (the default), only Gamemasters, or nobody. A GM's block on a
  player's video stops their share too: their token carries no screen
  right, their own core stops the share, and every other browser refuses
  it. The browser's own "Stop sharing" button ends a share, and so does
  leaving the call. The API adds `ParticipantState.hasScreen`,
  `LocalState.screenShare`, `commands.startScreenShare` and
  `commands.stopScreenShare`, `ServiceCapabilities.screenShare` and
  `TokenRequest.canPublish.screen`. The core's entry budget goes from
  124,500 to 130,500 bytes. The service contract checks that a
  share and its sound arrive apart from the camera, and that a token
  without the screen right is refused. P2P opens the lines for a share when
  a link starts, so a share needs no new negotiation; it is sent at full
  size with twice the camera's part of each link's upload, taken from the
  same upload budget as the camera. Closes #7.

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.1

No changes in this release.

## 0.10.0

### Patch Changes

- 6ff0f49: The API drops what the core never used, before 1.0 freezes it:
  `ServiceDefinition.mediaOwnership`, `ServiceCapabilities.moderation` and
  `simulcast`, and `ServiceConnection.moderation`. A service that still
  sets them keeps working; they may come back as optional members later.

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

- First release. Calls over a LiveKit server or LiveKit Cloud, with tokens
  a GM's browser signs for each player: the API secret stays with the GM.
  A GM moving from LiveKit AVClient is offered its server once, and the
  removal of the old setting every player could read.

### Patch Changes

- Updated dependencies
  - @modular-av/api@0.1.0
