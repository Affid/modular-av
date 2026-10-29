---
"@modular-av/api": minor
"@modular-av/livekit": patch
"@modular-av/p2p": patch
"@modular-av/jitsi": patch
---

The API drops what the core never used, before 1.0 freezes it:
`ServiceDefinition.mediaOwnership`, `ServiceCapabilities.moderation` and
`simulcast`, and `ServiceConnection.moderation`. A service that still
sets them keeps working; they may come back as optional members later.
