---
"@modular-av/p2p": patch
---

Two players joining a P2P call at about the same time hear each other at
once, not after half a minute of silence. Both sides used to offer their
first connection at the same moment; the side that gives way rolled its
offer back, and Chrome then sometimes gathered no network candidates for
it, so the link never connected until it was replaced 30 s later. That
side now waits a moment for the other's offer and answers it first
(offering anyway if none comes), and a link that never even began
checking network paths is started afresh at its 15 s connect timeout
rather than 15 s after it. A link that is checking paths but slow, as
through a relay server, keeps its time to connect.
