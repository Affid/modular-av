---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
---

A quiet player can be boosted: the volume in a participant's menu goes up to
200%, for this client, and is remembered like the volume was. Above 100% the
core plays them through Web Audio and a limiter just under full scale, so the
boost can't clip; its code loads with the first boost. Until the browser lets
that audio run (a page loaded without a click may have to wait for one), they
play at 100%. `commands.setVolume` takes 0 to 2.
