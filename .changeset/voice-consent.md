---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

Players now decide which modules get their voice, and everyone sees
which modules receive voices (#28). By default a player is asked, in a
Foundry dialog, the first time a module on someone's browser subscribes
to their voice through `api.media.audio`; until they allow it the module
gets `null`. They can instead allow or refuse every module, and forget
their answers, from "Voices for modules" in the module settings or a
settings window's Call tab. Each time a module starts receiving their
voice or screen sound, they get a notification, and Foundry's player
list marks the player whose browser runs it. The state carries
`voiceCopies` and `voiceConsent`, and the commands `setVoiceConsent`,
`decideVoiceCopy` and `forgetVoiceDecisions`. The testing package's fake
Foundry opens `DialogV2` dialogs a test answers. The core's entry budget
goes from 133,500 to 144,000 bytes.
