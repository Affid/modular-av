# @modular-av/audio-mixer

## 0.11.0

### Patch Changes

- d7c2b80: A card's state word stays inside its card. "Starts with your microphone" on
  the noise cancelling card hid the card's name and spilled over its switch; the
  card now says "No mic yet" on its model's line, and a word too long for a
  narrow card is cut short, with the whole word on hover.
- @modular-av/kit@0.11.0

## 0.10.1

### Patch Changes

- The module builder says a GM can change the table's voices from the audio
  mixer, and EQ's card has its own icon instead of the mixer's.
- @modular-av/kit@0.10.1

## 0.10.0

### Minor Changes

- 5634974: `modular-av-audio-mixer`, a window for a player's voice channel laid out like a
  sound engine: the chain as cards place by place with the voice gate's live
  level, every level on one row of faders, settings in a pop-up, a searchable
  list to add effects, warnings about what sounds wrong, and "Test my voice". It
  ships no effects.

### Patch Changes

- Updated dependencies [5634974]
  - @modular-av/kit@0.10.0
