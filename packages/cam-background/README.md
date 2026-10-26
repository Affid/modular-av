# Modular A/V: Camera background

Blurs or replaces your camera's background in your browser, with
MediaPipe's selfie segmentation. Turn it on in the voice panel or the
voice and video settings ("Camera background"). Requires `modular-av`,
and Chrome, Edge or another Chromium browser.

- **Blur**, with a strength from light to strong.
- **Replace**, with one of its images, Foundry's own backgrounds, or an
  image you choose: from Foundry's files if you may browse them, or by
  its address. An image on another server is loaded by your browser from
  that server, which needs to allow it.
- **Quality**: Standard (the default) or High, which is cleaner around
  hair and takes a little more of your graphics card. High needs graphics
  acceleration in your browser; without it Standard is used.

It runs in a background thread of your browser and its graphics card:
your page stays as responsive as without it. Its files come with the
module; your video goes nowhere for it.

**Your camera is never sent without it.** While it starts, if it stops
(a hidden tab may pause it) or if it can't run, your camera is kept off
and the dock says why. Turn the effect off to send your camera as it is.

## Licence

MIT. Its worker bundles `@mediapipe/tasks-vision` (Apache-2.0) and the
module serves MediaPipe's WebAssembly runtime and selfie models; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The images in
`backgrounds/` were drawn for it.
