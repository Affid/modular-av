---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/jitsi": patch
"@modular-av/testing": minor
---

Players can raise their camera's resolution, for this device: the
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
