---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/testing": minor
---

The core now owns dry:wet. An effect that declares its `latency` gets a
dry:wet control: the core delays the dry signal to match and mixes the two,
so the effect outputs only its processed signal. The wet amount of an effect on a send
works the same way, with `defaultMix` as its start. Players set both, and
how much of their voice goes out dry, under Voice & Video Settings, Voice,
Mix. The API adds `commands.setEffectMix`, `commands.setChannelLevel`,
`LocalState.effectMix` and `LocalState.channelLevel`.
