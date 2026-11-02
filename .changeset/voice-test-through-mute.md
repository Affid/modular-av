---
"@modular-av/api": minor
"@modular-av/core": minor
---

`preview.voice()` now hears through Mute and the push to talk key for as long
as its track is live, so a muted player can test their voice; what is sent
still follows Mute, so the table hears nothing. Before, the copy was silent
while muted.
