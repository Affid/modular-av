---
"@modular-av/api": minor
"@modular-av/core": minor
---

A service can ask for a fresh token while connected
(`ServiceConnection.updateToken`, answered through the GM relay), so a
long call over Jitsi stays up after its first token runs out.
