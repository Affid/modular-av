---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
---

The stall watchdog now also watches effects after the gate, each against
what it hears, and takes out any effect whose level runs away or stops being
a number. `AudioEffectDefinition.tail` says how long an effect keeps
sounding, so a long delay isn't taken for stalled before its first echo.
