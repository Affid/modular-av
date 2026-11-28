---
"@modular-av/core": patch
---

Less work on every player's browser during a game. The core reads each
of its settings from Foundry once until it changes, instead of dozens of
times on each update: in Foundry 14 every such read builds a whole
Setting document or searches all of them. And when another module writes
its own flags on a user, which some do every few seconds for every
player, the core no longer works out the call again.
