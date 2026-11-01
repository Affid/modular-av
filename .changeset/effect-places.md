---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
"@modular-av/mic-denoise": minor
"@modular-av/livekit-krisp": minor
---

Breaking for effect modules: an audio effect now names a place, not a stage.
`AudioPlace` replaces `AudioStage`, and `defaultPlace` replaces `stage`.
`denoise` and `voice` were one place, so both are now `pre-gate`; `post` is
`post-gate`, and `send` stays. Noise suppression still runs first. The core
now watches every effect ahead of the gate for stalls, and a stall in a series
is blamed on the first silent effect, not on what follows it.
