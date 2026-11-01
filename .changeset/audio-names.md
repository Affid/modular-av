---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

What works on audio effects only now says so in its name, so nobody builds a
video effect on it. The audio effects contract moved: `effectContract` is
`audioEffectContract`, imported from `@modular-av/testing/contract/audio-effects`.
Registering an effect of an unknown kind, or a video effect with audio fields
such as `defaultPlace` or `tail`, now throws.
