---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/livekit": minor
"@modular-av/p2p": minor
"@modular-av/jitsi": minor
"@modular-av/testing": minor
---

Players can share a screen, a window or a browser tab beside their
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
a link starts, so a share needs no new negotiation; it gets twice the
camera's bitrate at full size. Closes #7.
