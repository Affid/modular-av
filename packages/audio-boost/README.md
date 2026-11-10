# Modular A/V: Mic boost

Raises a quiet microphone for everyone, such as a laptop's built-in one, and
evens out its peaks so a laugh doesn't drown the table. It runs in your browser,
ahead of the voice gate by default, so the gate hears the raised voice. Requires
`modular-av`.

Turn it on and set it in `modular-av-audio-mixer`. Without the mixer, the core's
API is the only way to reach it: the dock shows noise suppression alone.

| Setting  | What it does                                               | Range      | Starts at |
| -------- | ---------------------------------------------------------- | ---------- | --------- |
| Boost    | How much louder your voice goes out                        | 0 to 24 dB | 6 dB      |
| Even out | How hard loud moments are brought down, raising quiet ones | 0% to 100% | 50%       |

A limiter just under full scale comes last, so a boosted shout can't clip. A
boost raises the room's noise too: noise cancellation, which runs first, keeps
it down. To make one other player louder for you alone, use the volume slider
in their menu instead, which goes up to 200%. It uses the browser's own
compressor, so it takes next to nothing. No audio leaves your browser for it.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one audio effect, registered with the core inside
  the `modularAV.register` hook (`src/register.ts`), and its controls as
  a contribution, which the audio mixer draws. It adds nothing to
  Foundry's own settings window and no socket.
- **How it works**: a gain, the browser's own `DynamicsCompressorNode`
  and a limiter, wired together as Web Audio nodes.
- **Code**: about 200 lines in 4 files, with no worklet and no worker.
  The build holds its entry file under 5 KB.
- **Third-party code**: none. It bundles a few helpers from
  `@modular-av/kit`, this repository's own.
- **Network**: none. **Storage**: its values, through the core's
  settings (`api.settings`).
- **Tests**: 1 unit test files (`pnpm vitest run packages/audio-boost`)
  and 1 in a real browser (`pnpm playwright test packages/audio-boost`).
  They include the shared audio effect contract from
  `@modular-av/testing`: it must pass sound through, stop cleanly and
  cost what it says.

## Licence

MIT.
