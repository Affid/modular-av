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

## Licence

MIT. Uses `@sapphi-red/web-noise-suppressor` (MIT) and its builds of
RNNoise, SpeexDSP (BSD-3-Clause) and GTCRN (MIT); see its notices.
