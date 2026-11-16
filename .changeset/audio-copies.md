---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

Modules that transcribe, caption or record a session can get each
player's sound on every service, not only LiveKit:
`api.media.audio(moduleId, participant, source, listener)` hands the
listener a copy of a player's microphone, or of the screen they share
(`"microphone"` or `"screen"`). For another player it is what this
client plays of them, before this client's volume; for the local player,
what they send. The listener gets `null` while this client may not hear
them (GM blocks, mutes, hide and deafen apply) and a new copy whenever
the track changes; the core stops the copies it replaced, and the last
one when the subscription ends, and stopping a copy never touches what
is played or sent. The asking module names itself, and the core refuses
one that isn't active. A module that records tells the people it
records; the README's privacy section says so. The testing package's
fake API records audio subscriptions and feeds them (`emitAudio`), and
fake tracks tell what they were cloned from. The core's entry budget
goes from 130,500 to 133,500 bytes. Closes #25.
