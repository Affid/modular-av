# Modular A/V: P2P

Carries Modular A/V's calls directly between players' browsers: no
server, no account, and no GM needed online. Each browser sends to each of
the others, so it suits small tables. Requires `modular-av`.

## Settings (world)

- **Most players in a call**: 2 to 10, 6 by default. GMs can always join.
- **STUN servers**: help browsers find each other through their routers,
  used when Foundry's A/V settings name no relay server of your own.
- **Send everything through the relay server**: with a TURN server set in
  Foundry's A/V settings, players never see each other's IP addresses.

Signalling goes through Foundry's own connection. Without a relay server,
players' browsers connect to each other directly and so learn each
other's IP addresses.

## Licence

MIT.
