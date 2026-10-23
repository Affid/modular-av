# Modular A/V

Voice and video for Foundry VTT (v14+), built from modules: a headless core,
one module per communication service, UI modules that give it a face, and
optional microphone and camera effects. The design and the reasons behind it
are in [docs/HANDOFF.md](docs/HANDOFF.md).

Status: milestone 2. The core and the LiveKit service work at a table
through Foundry's own camera dock: join with a token a GM's browser signs,
hear and see each other, mute, deafen, GM blocks, reconnecting. The dock UI,
P2P and effects come in later milestones.

## Packages

| Directory          | Package               | Foundry id           |
| ------------------ | --------------------- | -------------------- |
| `packages/api`     | `@modular-av/api`     | (types only)         |
| `packages/core`    | `@modular-av/core`    | `modular-av`         |
| `packages/livekit` | `@modular-av/livekit` | `modular-av-livekit` |
| `packages/testing` | `@modular-av/testing` | (library)            |

Later milestones add `livekit-krisp`, `p2p`, `dock`, `kit`, `mic-denoise`
and `cam-background`.

## Development

Requires Node 22.18+ and pnpm.

```bash
pnpm install
pnpm verify            # everything CI would run, locally
pnpm test          # unit tests (Vitest)
pnpm test:browser  # browser tests (Playwright, fake devices)
pnpm test:services # service contract against LiveKit in Docker
pnpm test:foundry  # end to end in the local Foundry world
pnpm build         # each module into packages/<dir>/dist
```

Local Foundry and Chrome: [docs/LOCAL-SETUP.md](docs/LOCAL-SETUP.md).
Releases: [docs/RELEASING.md](docs/RELEASING.md).

## Licence

MIT, see [LICENSE](LICENSE). Contains no code under the Hippocratic License;
third-party code is listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
and in each module's own notices.
