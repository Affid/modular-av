---
"@modular-av/jitsi": minor
---

The Jitsi module can join an open Jitsi server, such as a fresh
docker-jitsi-meet or Debian install, by a room link and nothing else
(#34). A new world setting, "How players get in", chooses between tokens
(as before) and an open server. For an open server, the GM pastes the
room link they would send to friends, such as
https://meet.example.com/OurTable; without a room, a random one is added
to the address. Players join without an app id or secret, and with no GM
online. Since the server vouches for nobody, Foundry does: each player's
browser names its Foundry user in its Jitsi presence and claims its place
in the room over Foundry's socket, and only a place both name is shown.
Someone in the room who isn't in the world gets no tile, and GMs see a
notice that they can see and hear the call. Docker's XMPP names are
tried when the link's host isn't the XMPP domain, and a sign-in token
pasted with a link is taken out of the setting.
