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

## Licence

MIT.
