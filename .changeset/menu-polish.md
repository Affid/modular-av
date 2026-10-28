---
"@modular-av/dock": patch
"@modular-av/core": patch
---

Fixes from playing with 0.8.0:

- The camera background's pictures show as proper thumbnails (Foundry's
  button height squeezed them), and the menus no longer scroll sideways.
- The arrow beside the microphone or the camera looks pressed, its
  chevron turned, while its menu is open.
- The dock's tooltips open away from its row of buttons (above the voice
  panel at the bottom of the screen, beside the collapsed rail), and a
  click takes the tooltip down so it doesn't sit over the menu it opened.
- A player's connection details open by their tile, not by the voice
  panel, which may be far away in the scattered layout.
- The settings window opens in the middle of the screen: it was placed
  for its first, still empty content and grew downwards from there.
- A tile's menu loads the first time it opens, which keeps the dock's
  first load smaller.
