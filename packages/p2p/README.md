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

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one service, registered with the core inside the
  `modularAV.register` hook, and three world settings (above).
- **How it works**: a mesh of the browser's own `RTCPeerConnection`s,
  one per other player. `src/signalling.ts` and `src/messages.ts` carry
  offers, answers and candidates over a channel of the core's Foundry
  socket, and check every message's shape and sender. `src/mesh*.ts`
  decide who links to whom, `src/link.ts` and `src/negotiation.ts` run
  one link, `src/roster.ts` keeps who is in the call and enforces the
  cap.
- **Code**: about 2,600 lines in 22 files. The entry file is held under
  10 KB.
- **Third-party code**: none.
- **Network**: other players' browsers, the STUN servers in its
  settings, and the relay (TURN) server from Foundry's own A/V settings
  if one is set. **Storage**: its three world settings.
- **Tests**: 14 unit test files (`pnpm vitest run packages/p2p`) and 3
  in a real browser (`pnpm playwright test packages/p2p`). They include
  the shared service contract from `@modular-av/testing`, which also
  runs through a real TURN server in Docker (`pnpm test:services`).

## Licence

MIT.
