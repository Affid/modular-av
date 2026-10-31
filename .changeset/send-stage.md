---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

A new `send` audio stage for what adds to the voice, like reverb and delay:
each `send` effect runs in an FX channel of its own, beside the voice, on a
copy taken after `post`, and outputs wet signal only. The voice gate now
drives the sends and the feed of `post` effects on the audio thread, so
native effects sleep while nobody speaks (in Firefox, only `send` effects
do). The core refuses an audio effect in a stage it doesn't know.
