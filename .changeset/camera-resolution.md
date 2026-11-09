---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/testing": minor
---

Players can raise their camera's resolution, for this device: the
browser's choice (as before, usually 640x480), 360p, 720p or 1080p, under
Voice & Video Settings, Video, "Resolution". The camera is asked for that
size, never forced to it, so a camera that can't do it opens at the
nearest size it has. A running camera is captured again at once, after
letting the old capture go, since Chrome keeps a camera that is still open
at its size. The API adds `VideoResolution`, `LocalState.videoResolution`
and `commands.setVideoResolution`; the service contract checks that a
camera captured again at a larger size arrives at that size.
