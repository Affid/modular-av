---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

The core now owns where an audio effect runs, and an effect's `defaultPlace` is
only where it starts. `commands.setEffectPlace` moves an effect, running or
not, without restarting it, and `commands.setEffectOrder` sets the order within
a place; both are saved per device and shown in `LocalState.effectPlaces` and
`LocalState.effectOrder`. The mix control and the tail hold follow the place:
an effect on a send always has a wet amount, and a tail ahead of Mute no longer
holds the output open. These are for UI modules to build on; the dock has no
controls for them yet.
