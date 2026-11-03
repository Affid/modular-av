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

## Licence

MIT.
