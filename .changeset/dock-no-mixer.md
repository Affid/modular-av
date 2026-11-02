---
"@modular-av/dock": minor
---

The dock no longer holds the voice pipeline: its Mix section is gone, and for
audio it offers only noise suppression. Levels, tails and every other audio
effect are in `modular-av-audio-mixer`, or the API without it.
