# Modular A/V: Radio

A walkie-talkie for your voice: a squad on comms, a ship's intercom, a spirit on
a crystal set. It cuts your voice down to the narrow band a radio carries,
crackles under it, and gives a burst of squelch when you stop talking. It runs
in your browser, after the voice gate by default, so the gate still hears your
clean voice. Requires `modular-av`.

Turn it on and set it in `modular-av-audio-mixer`. Without the mixer, the core's
API is the only way to reach it: the dock shows noise suppression alone.

| Setting | What it does                                             | Starts at |
| ------- | -------------------------------------------------------- | --------- |
| Drive   | How hard the voice is pushed into the radio's clipping   | 50%       |
| Static  | Hiss under the voice, louder as you are                  | 30%       |
| Squelch | The burst of noise when a transmission ends, 0% for none | 50%       |

The radio carries 300 Hz to 3 kHz. Static only sounds while you do. The squelch
comes when the voice gate closes or you let go of push to talk, so with your
microphone always on there is none. If it stops working, you are heard without
it. No audio leaves your browser for it.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one audio effect, registered with the core inside
  the `modularAV.register` hook (`src/register.ts`), and its controls as
  a contribution, which the audio mixer draws. It adds nothing to
  Foundry's own settings window and no socket.
- **How it works**: a high-pass, a clipper, a low-pass, hiss that
  follows the voice and a squelch burst, written as a small kernel
  (`public/worklets/`) that the core's audio worklet runs on the
  browser's audio thread.
- **Code**: about 320 lines in 5 files. The build holds its entry file
  under 5 KB.
- **Third-party code**: none. It bundles a few helpers from
  `@modular-av/kit`, this repository's own.
- **Network**: none. **Storage**: its values, through the core's
  settings (`api.settings`).
- **Tests**: 3 unit test files (`pnpm vitest run packages/audio-radio`)
  and 1 in a real browser (`pnpm playwright test packages/audio-radio`).
  They include the shared audio effect contract from
  `@modular-av/testing`: it must pass sound through, stop cleanly and
  cost what it says.

## Licence

MIT.
