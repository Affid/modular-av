---
"@modular-av/api": minor
"@modular-av/core": minor
"@modular-av/dock": minor
"@modular-av/testing": minor
---

The dock opens in a normal window of its own, which can be dragged to
another monitor and go full screen (a button in its header), in every
browser. Picture-in-Picture stays as "In a window always on top", in Chrome
and Edge; browsers don't let it go full screen. A window closes with
Foundry's page. The API adds `windows.popup` beside `windows.pip`, both
`PageWindows` (`PipWindow` and its kin stay as names for the same types);
the UI contract checks "a window of its own" against the popup, and the
window always on top for a UI that offers it (`UIDriver.openOnTop`).
