---
"@modular-av/testing": minor
---

The contract for effects after the voice gate now wants wet signal only from
anything that declares a `tail`, not just from what defaults to `send`, as a
player can move any effect to a send.
