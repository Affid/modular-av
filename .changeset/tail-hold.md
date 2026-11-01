---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/testing": minor
---

While a tail effect runs, a reverb or delay now rings out after a player
mutes, deafens or lets go of push to talk, for as long as the effect's `tail`,
at most 3 s. Nothing said after that reaches an effect, so a tail only carries
what already went out, and a GM's block still ends it at once. Players who
want the old behaviour turn on "Cut reverb and delay when my microphone
closes" under Voice, Mix. The API adds `LocalState.audioCutTails` and
`commands.setAudioCutTails`.
