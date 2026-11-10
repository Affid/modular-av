# Modular A/V: EQ

A three band equalizer for your voice: warm it up, thin it out, take the edge
off a harsh microphone. It runs in your browser, ahead of the voice gate by
default. Requires `modular-av`.

Turn it on and set it in `modular-av-audio-mixer`. Without the mixer, the core's
API is the only way to reach it: the dock shows noise suppression alone.

| Band | Where        | Range           | Starts at |
| ---- | ------------ | --------------- | --------- |
| Low  | Below 200 Hz | -12 dB to 12 dB | 0 dB      |
| Mid  | Around 1 kHz | -12 dB to 12 dB | 0 dB      |
| High | Above 4 kHz  | -12 dB to 12 dB | 0 dB      |

It uses the browser's own filters, so it takes next to nothing. No audio leaves
your browser for it.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one audio effect, registered with the core inside
  the `modularAV.register` hook (`src/register.ts`), and its controls as
  a contribution, which the audio mixer draws. It adds nothing to
  Foundry's own settings window and no socket.
- **How it works**: three of the browser's own `BiquadFilterNode`s in a
  row.
- **Code**: about 130 lines in 4 files, with no worklet and no worker.
  The build holds its entry file under 5 KB.
- **Third-party code**: none. It bundles a few helpers from
  `@modular-av/kit`, this repository's own.
- **Network**: none. **Storage**: its values, through the core's
  settings (`api.settings`).
- **Tests**: 1 unit test files (`pnpm vitest run packages/audio-eq`) and
  1 in a real browser (`pnpm playwright test packages/audio-eq`). They
  include the shared audio effect contract from `@modular-av/testing`:
  it must pass sound through, stop cleanly and cost what it says.

## Licence

MIT.
