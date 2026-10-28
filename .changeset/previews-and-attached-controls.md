---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/cam-background": minor
"@modular-av/testing": minor
---

For module authors: `api.preview.camera(element, { device, effect })` and
`api.preview.microphone(element, { device, listener })` preview a device
outside the call, and stop when asked or when the element goes. A
contributed control can name the `effect` it belongs to, and is shown
under that effect when it is chosen; a settings section can name its
`tab` (`"call"`, `"voice"`, `"video"` or `"appearance"`).

Camera background's strength and picture now show under Blur and Replace
themselves, instead of in a section of their own.

The testing package's fake Foundry holds the world's A/V settings as
`core.rtcWorldSettings`, as Foundry does, and fakes the previews.
