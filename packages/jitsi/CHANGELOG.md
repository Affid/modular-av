# @modular-av/jitsi

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

### Patch Changes

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
- e5d3822: Jitsi sends cameras at their full quality. Each player now tells the bridge
  what they want of a camera as soon as it arrives; before, the bridge heard
  nothing until a tile changed size or was hidden, and kept to its own default
  of 180p (a large tile could even stay black). A camera that changes during
  the call (another device, a new size, a camera effect turning on or off) is
  now sent at its own size: lib-jitsi-meet kept the bitrate and layers it had
  chosen for the first one, so a 720p camera went out at 640x360. The service
  contract closes each test's pages, so a camera left open by one test no
  longer sets the size of the next one's.

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

### Minor Changes

- First release. Calls over your own Jitsi Meet server with token
  authentication: the app secret stays in the GM's browser, players get
  short-lived tokens from it, and a token that runs out mid-call is
  replaced without leaving the call. See the module's README for what the
  server needs.
