---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/testing": minor
---

A worklet effect can now be just a kernel: `AudioEffectContext.host` runs it
in the core's worklet, which calls `render()` only while there is sound or
the effect's `tail` is still ringing, so no effect has to write its own early
return. A kernel that throws or outputs a non-number is reported as failed
and silenced. `api.createAudioEffectHost` does the same for a context of your own,
for an effect's tests and previews. See `docs/voice-routing.md`.
