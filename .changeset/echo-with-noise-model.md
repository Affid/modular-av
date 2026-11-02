---
"@modular-av/core": patch
---

Turning a noise model on no longer turns off echo cancellation in Chrome. The
microphone was opened again before the old capture closed, and Chrome then
gave the raw device, so a player on speakers could hear the call loop.
