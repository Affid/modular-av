# Modular A/V: Jitsi

Carries Modular A/V's calls over your own Jitsi Meet server, with token
authentication. Requires `modular-av`.

## What your Jitsi server needs

A self-hosted Jitsi Meet (tested with docker-jitsi-meet `stable-11248-2`)
with:

- **Token (JWT) authentication** with an app id and secret, and no
  guests: in docker-jitsi-meet, `ENABLE_AUTH=1`, `AUTH_TYPE=jwt`,
  `JWT_APP_ID`, `JWT_APP_SECRET`, `JWT_ALLOW_EMPTY=0` and `ENABLE_GUESTS=0`.
- **Prosody's `presence_identity` module on the main VirtualHost**, so
  the server tells everyone who each participant is, from their token
  (in docker-jitsi-meet, `XMPP_MODULES=presence_identity`). It isn't on
  in any of Jitsi's default setups. Without it nobody appears in the call,
  and the console says why: this module never takes a participant's word
  for who they are.
- **No moderator rights for players.** A Jitsi server with tokens makes
  everyone a moderator by default, and a moderator's client can mute or
  remove others. Let the token decide instead: Prosody's
  `token_affiliation` module on the conference component, and Jicofo
  neither handing out ownership nor running its own authentication (in
  docker-jitsi-meet, `XMPP_MUC_MODULES=token_affiliation`,
  `ENABLE_AUTO_OWNER=0` and `JICOFO_ENABLE_AUTH=0`; Prosody still checks
  every token). The tokens this module signs grant no moderator rights,
  and the console warns when the server makes a player one anyway.
- Its XMPP WebSocket (`/xmpp-websocket`) reachable from players'
  browsers, which open it from Foundry's address.

meet.jit.si and 8x8's Jitsi as a Service aren't supported: meet.jit.si
gives its sign-in tokens only to its own pages, and JaaS's terms for a
module like this one haven't been checked.

## Setting it up

1. In this module's settings, as a GM:
   - **Jitsi server address** (world): `https://meet.example.com`. Plain
     `http://` works only on your own computer or a private network.
   - **XMPP domain** and **conference domain** (world): leave them empty
     when they follow the address (`meet.example.com`,
     `conference.meet.example.com`). Docker installs use `meet.jitsi` and
     `muc.meet.jitsi`.
   - **Jitsi app id** and **secret** (this browser only): the server's
     `JWT_APP_ID` and `JWT_APP_SECRET`. Enter them in each browser a GM
     uses to run the game.
2. In Modular A/V's settings, choose Jitsi as the service.

## How players join

The secret never leaves the GM's browser. A player's browser asks a GM's
for a token; the GM's browser signs a short-lived one for that player
alone and this world's room, with no moderator rights and no name (names
shown in Foundry come from Foundry). So a GM must be online for players
to join or reconnect, as they would be for a session. When a token runs
out during a long call, the player's browser gets a fresh one the same
way, without leaving the call.

## What's different from LiveKit

- Jitsi's tokens can't limit what a player sends, so a GM's block is
  enforced by everyone else's browser, which refuses that player's
  audio or video (and asks the server not to send it), as with P2P.
- Every call goes through the server, even for two players (Jitsi's own
  peer-to-peer mode is off).
- Who is speaking comes from each player's own voice detection, shared
  over Foundry.
- Screen sharing, end-to-end encryption, the lobby, recording and
  transcription aren't supported.
- Servers much older or newer than the tested one may not work: Jitsi
  publishes no rule for which versions of its client and server work
  together.

The browser talks only to your Jitsi server: lib-jitsi-meet's analytics,
statistics and log collection stay off. Like LiveKit's, Jitsi's client
puts the token in the WebSocket's address, so it can show in that
browser's console and in your server's logs while it is valid (ten
minutes).

## Licence

MIT. Ships lib-jitsi-meet unmodified (Apache-2.0); see its notices.
