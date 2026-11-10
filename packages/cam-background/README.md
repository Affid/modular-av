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

## Inside this package

For someone reading the code. How the modules fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

- **What it adds**: one video effect, registered with the core inside
  the `modularAV.register` hook, and its controls as a contribution (the
  dock and the settings window draw them).
- **How it works**: the page hands each camera frame to a web worker
  (`src/worker/`), which runs MediaPipe's segmentation and draws the
  result with WebGL (`src/pipeline/`). `src/host.ts` starts the worker
  and watches that it stays alive; when it doesn't, the core keeps the
  camera off.
- **Code**: about 3,250 lines in 27 files. The entry file is held under
  11 KB and the worker under 240 KB; the worker loads only when a player
  turns the effect on.
- **Third-party code**: `@mediapipe/tasks-vision` 1.1.1 (Apache-2.0),
  bundled into the worker, with its WebAssembly runtime copied from the
  npm package at build time. Two of MediaPipe's selfie models are
  downloaded at build time from Google's model storage and checked
  against fixed SHA-256 hashes (`package.json`, `modularAV.downloads`).
  All of it ships in the module's zip.
- **Network**: none of its own at run time. If a player chooses a
  background image by address, their browser loads that image.
  **Storage**: the player's choices, through the core's settings.
- **Tests**: 11 unit test files (`pnpm vitest run
packages/cam-background`) and 5 in a real browser (`pnpm playwright
test packages/cam-background`). They include the shared video effect
  contract from `@modular-av/testing`, and a benchmark (`pnpm
bench:camera`).

## Licence

MIT. Its worker bundles `@mediapipe/tasks-vision` (Apache-2.0) and the
module serves MediaPipe's WebAssembly runtime and selfie models; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The images in
`backgrounds/` were drawn for it.
