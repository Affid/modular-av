---
"@modular-av/core": patch
---

A player who joins before a GM gets in as soon as the GM's page can sign
their token, not up to a retry or two later. When a GM logs in, their page
is often still loading, so the player's request went unanswered and they
waited for the next round (10 s, and more on a world slow to load); leaving
and joining again ran into the same wait. A GM's page now tells waiting
players when it can sign (once it listens, or once the GM's own token is
signed with a secret entered later), and they ask again at once, even while
they wait for an answer to a request the page never saw. The core's entry
budget goes from 144,000 to 145,500 bytes.
