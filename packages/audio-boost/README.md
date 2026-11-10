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

## Licence

MIT.
