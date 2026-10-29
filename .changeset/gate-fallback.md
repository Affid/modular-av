---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/testing": minor
---

Voice activity mode can now hold the microphone off when its voice gate
can't run, instead of sending everything as an open mic. Players choose
it under Voice & Video Settings, Voice, "If voice activity can't run"
(sending stays the default). The API adds `LocalState.gateFallback`,
`LocalState.microphoneHold` and `commands.setGateFallback`; the dock
shows a `microphone-held` warning, and the UI contract checks it.
