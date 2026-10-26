# Modular A/V: LiveKit

Carries Modular A/V's calls over a LiveKit server: your own or LiveKit
Cloud. Requires `modular-av`.

## Setting it up

1. Create a project on LiveKit Cloud, or run your own LiveKit server.
2. In this module's settings, as a GM:
   - **LiveKit server URL** (world): `wss://…`. Plain `ws://` works only on
     your own computer or a private network.
   - **LiveKit API key** and **secret** (this browser only): enter them in
     each browser a GM uses to run the game.
3. In Modular A/V's settings, choose LiveKit as the service.

## How players join

The secret never leaves the GM's browser. A player's browser asks a GM's
for a token; the GM's browser signs a short-lived one for that player
alone, for this world's room, allowed to send only what the GM's
permissions allow. So a GM must be online for players to join or
reconnect, as they would be for a session; the dock says "waiting for
the GM" meanwhile.

Coming from LiveKit AVClient, which kept the secret where every player
could read it: the first time a GM opens the world, this module offers
to bring the old server over and to remove the old setting. Replace your
key afterwards; see [MIGRATING.md](../../docs/MIGRATING.md).

## Licence

MIT. Bundles `livekit-client` (Apache-2.0); see its notices.
