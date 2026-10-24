# Modular A/V

Voice and video for Foundry VTT (v14+), built from modules: a headless core,
one module per communication service, UI modules that give it a face, and
optional microphone and camera effects. The design and the reasons behind it
are in [docs/HANDOFF.md](docs/HANDOFF.md).

Status: milestone 4. The core works at a table through Foundry's own
camera dock with two services: LiveKit (join with a token a GM's browser
signs) and P2P (direct between players' browsers, no server and no GM
needed, Foundry's TURN server if set). Hear and see each other, mute,
deafen, GM blocks, reconnecting; the core's media pipeline (devices, voice
gate, effects that fail closed). The dock UI and the effect modules come in
later milestones.

## Packages

| Directory          | Package               | Foundry id           |
| ------------------ | --------------------- | -------------------- |
| `packages/api`     | `@modular-av/api`     | (types only)         |
| `packages/core`    | `@modular-av/core`    | `modular-av`         |
| `packages/livekit` | `@modular-av/livekit` | `modular-av-livekit` |
| `packages/p2p`     | `@modular-av/p2p`     | `modular-av-p2p`     |
| `packages/testing` | `@modular-av/testing` | (library)            |

Later milestones add `livekit-krisp`, `dock`, `kit`, `mic-denoise` and
`cam-background`.

## Development

Requires Node 22.18+ and pnpm.

```bash
pnpm install
pnpm verify            # everything CI would run, locally
pnpm test          # unit tests (Vitest)
pnpm test:browser  # browser tests (Playwright, fake devices)
pnpm test:services # service contracts: LiveKit and coturn (P2P) in Docker
pnpm test:foundry  # end to end in the local Foundry world
pnpm build         # each module into packages/<dir>/dist
```

Local Foundry and Chrome: [docs/LOCAL-SETUP.md](docs/LOCAL-SETUP.md).
Releases: [docs/RELEASING.md](docs/RELEASING.md).

## Licence

MIT, see [LICENSE](LICENSE). Contains no code under the Hippocratic License;
third-party code is listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
and in each module's own notices.
