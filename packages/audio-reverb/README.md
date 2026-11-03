# Modular A/V: Reverb

A reverb for your voice: a hall, a cave, a cathedral. It runs in your browser,
on a send beside the voice by default, so it rings on after you stop speaking
without holding the voice gate open. Requires `modular-av`.

Turn it on and set it in `modular-av-audio-mixer`. Without the mixer, the core's
API is the only way to reach it: the dock shows noise suppression alone.

| Setting    | Range        | Starts at |
| ---------- | ------------ | --------- |
| Decay      | 0.3 s to 3 s | 1.5 s     |
| Brightness | 0% to 100%   | 50%       |

It takes about 1% of a core while you speak, and next to nothing in silence. If
it stops working, you are heard without it. No audio leaves your browser for it.

## Licence

MIT. The delay lengths are Freeverb's (Jezar at Dreampoint, public domain).
