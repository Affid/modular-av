# Modular A/V: Krisp for LiveKit Cloud

Adds LiveKit's Krisp noise filter to Modular A/V's noise cancellation
choice, next to RNNoise, Speex and GTCRN (`modular-av-mic-denoise`). It is
offered only while the call goes through **LiveKit Cloud**, which licenses
Krisp to its projects; on a self-hosted LiveKit server or with P2P it isn't
shown. Requires `modular-av` and `modular-av-livekit`.

## What it downloads

This module contains none of LiveKit's code. When a player turns Krisp
on, their browser downloads `@livekit/krisp-noise-filter` 0.4.5 from npm
through jsDelivr, accepts it only if it matches a fixed SHA-384 hash, and
runs it unchanged. Krisp then downloads its models from LiveKit
(`integrations.livekit.io`); those are LiveKit's files, not checked
against a hash here, and trusted as LiveKit's package is. Both downloads happen once and are cached by
the browser; a network that blocks either makes Krisp fail, and the player
is heard without it.

## What Krisp tells LiveKit

Krisp runs in the player's browser: no audio leaves it for Krisp or
LiveKit beyond the call itself. To work, it checks with your LiveKit Cloud
project that Krisp is enabled, using the call's connection, and it reports
its use to that project: the room's name and id, the player's identity
(their Foundry user id) and how long it ran. GMs who don't want that can
leave this module off.

## Settings

- **Krisp model quality** (per device): low, medium (default) or high.
  Higher quality removes more noise and takes more of the computer. It
  applies the next time Krisp starts.

## Licence

This module's code is MIT. `@livekit/krisp-noise-filter` is LiveKit's and
not open source; it is used under LiveKit's terms of service
(<https://livekit.io/legal/terms-of-service>) and not redistributed here.
