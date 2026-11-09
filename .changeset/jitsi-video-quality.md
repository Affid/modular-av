---
"@modular-av/jitsi": patch
"@modular-av/testing": patch
---

Jitsi sends cameras at their full quality. Each player now tells the bridge
what they want of a camera as soon as it arrives; before, the bridge heard
nothing until a tile changed size or was hidden, and kept to its own default
of 180p (a large tile could even stay black). A camera that changes during
the call (another device, a new size, a camera effect turning on or off) is
now sent at its own size: lib-jitsi-meet kept the bitrate and layers it had
chosen for the first one, so a 720p camera went out at 640x360. The service
contract closes each test's pages, so a camera left open by one test no
longer sets the size of the next one's.
