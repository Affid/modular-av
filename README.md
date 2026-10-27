# Modular A/V

Voice and video for Foundry VTT (v14+), built from modules you pick: a
core, the service your table talks through, the look of the camera dock,
and effects for your microphone and camera. It reconnects by itself,
never shows a state it isn't in (a mute that isn't applied, a blur that
isn't running), and keeps your server's secret away from players.

## Modules

Install the core, one service and the dock; add effects as you like.
Paste a module's manifest URL into Foundry's "Install Module" dialog.

| Module                      | What it does                                                           | Manifest URL                                                                                         |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `modular-av`                | The core: needed by all the others.                                    | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av/module.json`                |
| `modular-av-livekit`        | Calls over your LiveKit server or LiveKit Cloud.                       | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-livekit/module.json`        |
| `modular-av-p2p`            | Calls directly between players' browsers, no server: for small tables. | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-p2p/module.json`            |
| `modular-av-jitsi`          | Calls over your own Jitsi Meet server (with token authentication).     | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-jitsi/module.json`          |
| `modular-av-dock`           | The camera dock, voice panel and settings window.                      | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-dock/module.json`           |
| `modular-av-dock-vines`     | A theme for the dock: vine leaves around the cameras.                  | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-dock-vines/module.json`     |
| `modular-av-mic-denoise`    | Noise cancellation in your browser: RNNoise, Speex or GTCRN.           | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-mic-denoise/module.json`    |
| `modular-av-cam-background` | Blurs or replaces your camera's background, in your browser.           | `https://raw.githubusercontent.com/Affid/modular-av/manifests/modular-av-cam-background/module.json` |

Each module's own page: [core](packages/core/README.md),
[LiveKit](packages/livekit/README.md), [P2P](packages/p2p/README.md),
[Jitsi](packages/jitsi/README.md), [dock](packages/dock/README.md),
[vines theme](packages/dock-vines/README.md),
[noise cancellation](packages/mic-denoise/README.md),
[camera background](packages/cam-background/README.md).
`modular-av-livekit-krisp` (Krisp on LiveKit Cloud) is held back from
releases for now; see its [README](packages/livekit-krisp/README.md).

Coming from LiveKit AVClient? Your server and each player's choices come
along: see [docs/MIGRATING.md](docs/MIGRATING.md).

## Browsers

Chrome, Edge and other Chromium browsers run everything. Firefox and
Safari aren't tested yet; there the camera background isn't offered and
the dock can't open in a window of its own.

## Privacy and security

- Your LiveKit API secret, or your Jitsi app secret, stays in the GM's
  browser. Players get short-lived tokens, signed for them alone, from a
  GM's browser.
- Mute applies to what is sent, in every state of the connection.
- A camera background that isn't running keeps your camera off: it is
  never sent without it.
- Noise cancellation and camera backgrounds run in your browser; no audio
  or video goes anywhere for them. Their files come with the modules.

## For developers

The design and the reasons behind it are in
[docs/HANDOFF.md](docs/HANDOFF.md).

| Directory                 | Package                      | Foundry id                  |
| ------------------------- | ---------------------------- | --------------------------- |
| `packages/api`            | `@modular-av/api`            | (types only)                |
| `packages/core`           | `@modular-av/core`           | `modular-av`                |
| `packages/kit`            | `@modular-av/kit`            | (library)                   |
| `packages/dock`           | `@modular-av/dock`           | `modular-av-dock`           |
| `packages/dock-vines`     | `@modular-av/dock-vines`     | `modular-av-dock-vines`     |
| `packages/livekit`        | `@modular-av/livekit`        | `modular-av-livekit`        |
| `packages/livekit-krisp`  | `@modular-av/livekit-krisp`  | `modular-av-livekit-krisp`  |
| `packages/p2p`            | `@modular-av/p2p`            | `modular-av-p2p`            |
| `packages/jitsi`          | `@modular-av/jitsi`          | `modular-av-jitsi`          |
| `packages/mic-denoise`    | `@modular-av/mic-denoise`    | `modular-av-mic-denoise`    |
| `packages/cam-background` | `@modular-av/cam-background` | `modular-av-cam-background` |
| `packages/testing`        | `@modular-av/testing`        | (library)                   |

### Development

Requires Node 22.18+ and pnpm.

```bash
pnpm install
pnpm verify            # everything CI would run, locally
pnpm test          # unit tests (Vitest)
pnpm test:browser  # browser tests (Playwright, fake devices; noise models in the "effects" project)
pnpm test:services # service contracts: LiveKit, coturn (P2P) and Jitsi in Docker
pnpm test:foundry  # end to end in the local Foundry world
pnpm bench:camera  # camera background measurements (not part of verify)
pnpm build         # each module into packages/<dir>/dist
```

Local Foundry and Chrome: [docs/LOCAL-SETUP.md](docs/LOCAL-SETUP.md).
Releases: [docs/RELEASING.md](docs/RELEASING.md).

## Licence

MIT, see [LICENSE](LICENSE). Contains no code under the Hippocratic License;
third-party code is listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
and in each module's own notices.
