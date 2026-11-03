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

## Licence

MIT.
