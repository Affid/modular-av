# Modular A/V: Echo

An echo for your voice: a canyon, a distant call, a spirit. It runs in your
browser, on a send beside the voice by default, so the repeats carry on after
you stop speaking without holding the voice gate open. Requires `modular-av`.

Turn it on and set it in `modular-av-audio-mixer`. Without the mixer, the core's
API is the only way to reach it: the dock shows noise suppression alone.

| Setting | Range           | Starts at |
| ------- | --------------- | --------- |
| Time    | 50 ms to 600 ms | 300 ms    |
| Decay   | 0.3 s to 3 s    | 1.5 s     |

Decay is how long the repeats take to die away. A decay no longer than the time
gives one repeat. If it stops working, you are heard without it. No audio leaves
your browser for it.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one audio effect, registered with the core inside
  the `modularAV.register` hook (`src/register.ts`), and its controls as
  a contribution, which the audio mixer draws. It adds nothing to
  Foundry's own settings window and no socket.
- **How it works**: a feedback delay line, written as a small kernel
  (`public/worklets/`) that the core's audio worklet runs on the
  browser's audio thread.
- **Code**: about 220 lines in 5 files. The build holds its entry file
  under 5 KB.
- **Third-party code**: none. It bundles a few helpers from
  `@modular-av/kit`, this repository's own.
- **Network**: none. **Storage**: its values, through the core's
  settings (`api.settings`).
- **Tests**: 3 unit test files (`pnpm vitest run packages/audio-echo`)
  and 1 in a real browser (`pnpm playwright test packages/audio-echo`).
  They include the shared audio effect contract from
  `@modular-av/testing`: it must pass sound through, stop cleanly and
  cost what it says.

## Licence

MIT.
