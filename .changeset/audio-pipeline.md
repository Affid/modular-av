---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

What an audio mixer needs from the core. `commands.setAudioPipeline(change)`
sets places, order, mix and Channel level at once: checked whole, saved
together, applied once, with mix checked against the places in the same change.
`state.local.chosenEffects` lists what a device turned on, in a call or not, and
`preview.voice()` is a copy of what is sent, to play back to the player.
