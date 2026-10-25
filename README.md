# Modular A/V

Voice and video for Foundry VTT (v14+), built from modules: a headless core,
one module per communication service, UI modules that give it a face, and
optional microphone and camera effects. The design and the reasons behind it
are in [docs/HANDOFF.md](docs/HANDOFF.md).

Status: milestone 6. The core works at a table with two services, LiveKit
(join with a token a GM's browser signs) and P2P (direct between players'
browsers, no server and no GM needed, Foundry's TURN server if set): hear
and see each other, mute, deafen, GM blocks, reconnecting, the media
pipeline (devices, voice gate, effects that fail closed). The dock gives it
a face (camera dock, voice panel, settings window, player list,
Picture-in-Picture). Noise cancellation: RNNoise, Speex and GTCRN in
the browser, and LiveKit's Krisp on LiveKit Cloud. Camera background
effects come next.

## Packages

| Directory                | Package                     | Foundry id                 |
| ------------------------ | --------------------------- | -------------------------- |
| `packages/api`           | `@modular-av/api`           | (types only)               |
| `packages/core`          | `@modular-av/core`          | `modular-av`               |
| `packages/kit`           | `@modular-av/kit`           | (library)                  |
| `packages/dock`          | `@modular-av/dock`          | `modular-av-dock`          |
| `packages/livekit`       | `@modular-av/livekit`       | `modular-av-livekit`       |
| `packages/livekit-krisp` | `@modular-av/livekit-krisp` | `modular-av-livekit-krisp` |
| `packages/p2p`           | `@modular-av/p2p`           | `modular-av-p2p`           |
| `packages/mic-denoise`   | `@modular-av/mic-denoise`   | `modular-av-mic-denoise`   |
| `packages/testing`       | `@modular-av/testing`       | (library)                  |

`modular-av-livekit-krisp` contains none of LiveKit's code: players'
browsers download LiveKit's Krisp filter from npm when they turn it on
(see its [README](packages/livekit-krisp/README.md)). It is held back from
releases until LiveKit confirms. Later milestones add `cam-background` and
`jitsi`.

## Development

Requires Node 22.18+ and pnpm.

```bash
pnpm install
pnpm verify            # everything CI would run, locally
pnpm test          # unit tests (Vitest)
pnpm test:browser  # browser tests (Playwright, fake devices; noise models in the "effects" project)
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
