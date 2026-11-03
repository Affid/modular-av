---
"@modular-av/core": patch
---

A long held note no longer closes the voice gate. In voice activity mode with
automatic sensitivity, a steady note could be taken for background noise and
cut after 5 to 15 seconds. The cost is that a loud steady noise starting during
a call now takes over 30 seconds to be learned, instead of 5 to 12.
