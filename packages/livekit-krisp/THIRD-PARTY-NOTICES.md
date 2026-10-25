# Third-party notices: modular-av-livekit-krisp

This module bundles no third-party code.

When a player turns Krisp on, their browser downloads LiveKit's
`@livekit/krisp-noise-filter` 0.4.5 from npm through jsDelivr
(`https://cdn.jsdelivr.net/npm/@livekit/krisp-noise-filter@0.4.5/dist/index.js`),
checked against a fixed SHA-384 hash, and runs it unchanged. That package
is not open source: it is LiveKit's, under LiveKit's terms of service
(https://livekit.io/legal/terms-of-service), and this module does not
redistribute it. Krisp then downloads its models from LiveKit
(integrations.livekit.io).
