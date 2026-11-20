---
"@modular-av/audio-boost": patch
"@modular-av/audio-echo": patch
"@modular-av/audio-eq": patch
"@modular-av/audio-radio": patch
"@modular-av/audio-reverb": patch
---

Each voice effect now recommends the audio mixer, so Foundry offers the
mixer when you install or enable the effect. Until now nothing pointed
to it, and without the mixer players had no way to turn an effect on.
The effects still don't require the mixer: another module can turn them
on through the core's API.
