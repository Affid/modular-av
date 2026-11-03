# Modular A/V: Audio mixer

A window for your own voice: which effects run, in which order, where in the
channel, and how loud. Requires `modular-av`.

It holds no effects. It mixes the effect modules a world has turned on, such as
`modular-av-mic-denoise`, `modular-av-audio-reverb`, `modular-av-audio-echo`,
`modular-av-audio-eq` and `modular-av-audio-radio`, and says so when there are
none.

Open it from the dock's quick controls, the Voice tab of the settings window, or
Foundry's module settings.

The window reads like a sound engine. On top, your chain as cards, place by
place: before the voice gate, the gate with its live level, after it, and the
sends. A "+" adds an effect from a searchable list; each card has its own on
switch and a button for its settings. Below, every level of the chain on one row
of faders. Everything works from the keyboard, and dragging a card moves it too.

**Test my voice** records a few seconds of your voice with every effect and
plays it back, so it needs no headphones and can't feed back. Mute yourself
first and the table won't hear the test.

## Licence

MIT.
