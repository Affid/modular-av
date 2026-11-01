---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

A new `send` place for what adds to the voice, like reverb and delay: each
effect on a send runs in an FX channel of its own, beside the voice, on a
copy taken after the post-gate effects, and outputs wet signal only. The voice gate now
drives the sends and the feed of post-gate effects on the audio thread, so
native effects sleep while nobody speaks (in Firefox, only sends do). The
core refuses an audio effect in a place it doesn't know.
