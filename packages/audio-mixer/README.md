# Modular A/V: Audio mixer

A window for your own voice: which effects run, in which order, where in the
channel, and how loud. Requires `modular-av`.

It holds no effects. It mixes the effect modules a world has turned on, such as
`modular-av-mic-denoise`, `modular-av-audio-reverb`, `modular-av-audio-echo`,
`modular-av-audio-eq`, `modular-av-audio-radio` and `modular-av-audio-boost`,
and says so when there are none.

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

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), and this module's
own design in [docs/audio-mixer.md](../../docs/audio-mixer.md).

- **What it adds**: a window (a Foundry `ApplicationV2`), a button for
  it in the dock and the settings window (three contributions), one
  entry in Foundry's module settings, and two keys in Configure Controls
  for the next and previous preset. It registers no effect: it reads the
  effects other modules registered and changes them through the core's
  commands.
- **Code**: about 7,300 lines in 48 files. `src/window/` is the window
  (about half of it), `src/model/` turns the core's state into what the
  window shows, `src/presets/` saves and applies presets, `src/layers/`
  and `src/table/` are a GM's changes to the table's voices. The entry
  file is held under 10 KB; the window loads when first opened.
- **Third-party code**: none, beyond helpers from `@modular-av/kit`.
- **Network**: none. A GM's change reaches players through a world
  setting and Foundry's own socket. **Storage**: presets with the
  player's Foundry user, a GM's current change in a world setting, and
  the effects a player picked last in the browser.
- **What a GM can do to a player**: lay a preset over their voice. The
  player's own browser applies it, shows a notice, and can refuse it;
  the mixer can't unmute anyone or send anything the player didn't.
- **Tests**: 19 unit test files (`pnpm vitest run
packages/audio-mixer`). The window is also driven end to end in a real
  Foundry world (`tests/foundry/audio-mixer.spec.ts`).

## Licence

MIT.
