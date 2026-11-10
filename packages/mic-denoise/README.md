# Modular A/V: Noise cancellation

Removes background noise from your microphone in your browser, with
RNNoise, Speex or GTCRN. Pick a model in the voice and video settings
("Noise cancellation"); it is off until you do. Requires `modular-av`.

| Model   | Takes of your computer     | Notes                                        |
| ------- | -------------------------- | -------------------------------------------- |
| RNNoise | Light (about 2% of a core) | Recommended                                  |
| Speex   | Light (under 1%)           | Lightest                                     |
| GTCRN   | Medium (about 5%)          | Removes most; may crackle on a slow computer |

Your browser's own noise suppression is turned off while a model runs
(they would fight each other). If a model stops working, you are heard
without it. The models' files come with the module; no audio leaves your
browser for them.

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: three audio effects in one group (RNNoise, Speex,
  GTCRN), registered with the core inside the `modularAV.register` hook.
  One runs at a time; the dock and the settings window offer the choice.
- **How it works**: each model is an audio worklet with a WebAssembly
  file, from `@sapphi-red/web-noise-suppressor`. `src/runtime.ts` loads
  the chosen one into the core's audio context.
- **Code**: about 450 lines in 8 files. The entry file is held under 8
  KB; a model's files load when a player picks it.
- **Third-party code**: `@sapphi-red/web-noise-suppressor` 0.4.1 (MIT)
  with its builds of RNNoise and SpeexDSP (BSD-3-Clause) and GTCRN
  (MIT). The files are copied from the npm package at build time
  (`package.json`, `modularAV.assets`) and ship in the module's zip.
- **Network**: none. **Storage**: the chosen model, through the core's
  settings.
- **Tests**: 5 unit test files (`pnpm vitest run packages/mic-denoise`)
  and 2 in a real browser (`pnpm playwright test packages/mic-denoise`).

## Licence

MIT. Uses `@sapphi-red/web-noise-suppressor` (MIT) and its builds of
RNNoise, SpeexDSP (BSD-3-Clause) and GTCRN (MIT); see its notices.
