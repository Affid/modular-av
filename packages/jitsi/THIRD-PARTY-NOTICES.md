# Third-party notices: modular-av-jitsi

This module ships lib-jitsi-meet unmodified, as Jitsi builds it, in
`vendor/lib-jitsi-meet.min.js`: build v2205.0.0+7d14f385 from
https://github.com/jitsi/lib-jitsi-meet/releases (the build Jitsi Meet
stable 11248 uses), downloaded at build time and checked against a pinned
SHA-256. It is licensed under the Apache License 2.0, whose text is in
`vendor/lib-jitsi-meet.LICENSE`. Source: https://github.com/jitsi/lib-jitsi-meet

That file bundles these packages, at the versions lib-jitsi-meet pins
(and, for their own dependencies, as resolved when Jitsi built it):

- @jitsi/js-utils 6.3.2 (Apache-2.0), with js-md5 0.7.3 (MIT),
  @hapi/bourne 3.0.0 (BSD-3-Clause) and ua-parser-js 1.0.35 (MIT)
- @jitsi/logger 2.1.1 (Apache-2.0)
- @jitsi/precall-test 1.0.6 (Apache-2.0)
- @jitsi/rtcstats 9.7.1 (MIT), with sdp 3 (MIT) and uuid 8 (MIT)
- @testrtc/watchrtc-sdk 1.38.2 (ISC)
- async-es 3.2.4 (MIT)
- base64-js 1.5.1 (MIT)
- current-executing-script 0.1.3 (MIT)
- emoji-regex 10.4.0 (MIT)
- jwt-decode 4.0.0 (MIT)
- lodash-es 4.18.1 (MIT)
- sdp-transform 2.3.0 (MIT)
- strophe.js 1.5.0, Jitsi's fork v1.5-jitsi-3 (MIT)
- uuid 14.0.0 (MIT)
- webrtc-adapter 8.1.1 (BSD-3-Clause), with sdp 3 (MIT)

The module turns off what these could send elsewhere: lib-jitsi-meet's
analytics, rtcstats and watchRTC stay disabled, so the browser talks only
to the table's own Jitsi server.
