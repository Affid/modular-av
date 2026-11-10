# @modular-av/testing

What the other packages test with. It is a development dependency only:
no module's zip contains any of it, and it has no Foundry id.

- **A fake Foundry** (`src/foundry/`): the parts of Foundry's client the
  modules touch (settings, hooks, users, the socket, the A/V classes),
  so unit tests run without a Foundry server.
- **A mock service** (`src/service/`): a service module that carries
  nothing, for testing the core and UI modules.
- **Fake media** (`src/media/`, `src/rtc/`): microphones, cameras, audio
  contexts and peer connections that tests can drive.
- **Contract suites** (`src/contract/`): one test suite per kind of
  module, which every module of that kind runs. A service must connect,
  publish, report and recover; a UI must show mute, deafen, speaking,
  blocked, the connection's state, an open mic and a failed effect; an
  audio or video effect must pass media through, stop cleanly and cost
  what it says; a theme must keep contrast and every state visible.
- **A browser harness** (`src/harness/`): pages for the Playwright
  tests, with real audio and video in Chromium.

How the tiers of tests fit together is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), "How it is tested".

## Inside this package

- **Code**: about 9,200 lines in 50 files.
- **Tests**: 17 unit test files of its own (`pnpm vitest run
packages/testing`), so the fakes are checked too.

## Licence

MIT.
