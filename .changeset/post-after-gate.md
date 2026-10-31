---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/testing": minor
---

`post` effects now run after the voice gate, not before it, so a reverb's
tail is no longer cut by the gate and no longer holds it open. A `post`
effect now also keeps sounding while the gate is closed, so it must not
make sound of its own. Mute now closes right after the gate as well as on
the output, so `post` effects don't hear what a player says while muted.
