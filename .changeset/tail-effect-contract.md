---
"@modular-av/testing": minor
---

A new contract for effects after the voice gate,
`@modular-av/testing/contract/tail-effects`: an effect must cost next to
nothing on silence, ring no longer than its `tail` says, and, on a send,
output no dry signal.
