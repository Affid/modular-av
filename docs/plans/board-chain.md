# Plan: the modules board as a signal chain of cards

The "Plan your modules" window (core, `packages/core/src/modules/`) is
rebuilt after the mock-up the owner approved on 2026-10-28
(https://claude.ai/artifact/UUQRXAtPa9cNLynY87pU8f): the signal chain's
structure dealt as game-style cards.

## Why

The assembly board (0.4.0) put the pieces in a tray far from their
sockets, and a GM had to know the family's vocabulary before choosing.
The chain shows what each kind of module is for by where it sits in the
call; starter builds make the first choice about the table; the steps
say what is next and where it happens.

## What it becomes

- **Status line**, then **On air**: what the world runs now, as a short
  chain of chips (effects, service, cameras, theme), with updates and
  "nothing carries calls yet".
- **Next**: the chain the GM builds, nothing changing until Go live. In
  jack (players' mics and cameras), Effects, Service, Cameras (a Theme
  slot under the Dock), Out jack (everyone's screen). Each stage holds
  cards: emblem tinted by kind, status chip, what going live does to it,
  Update and New ribbons. It stacks vertically below 700 px.
- **A stage opens** its choices as tiles (In chain, New, Update, Coming
  soon, locked "Needs the Dock") with an inspect panel: status, version,
  what it does, its facts, one action. Built-in choices (Foundry's own
  camera dock, the Dock's own look) are tiles too.
- **Starter builds** under the chain while no service is planned: three
  cards that fill the chain in one click.
- **Load in, Go live, Soundcheck** as objectives: place tag (On the
  Setup screen / In this world), install progress, the current one
  highlighted. Load in carries the links (copy, save as a file, whisper
  to chat) and leaves for Setup with the existing confirmation; Go live
  keeps the service on air until its replacement can take over;
  Soundcheck lists each running module's settings to check, each
  opening the Voice & Video Settings on its tab.
- Undo, "Back to what is on air", Escape and focus handling as in the
  mock-up.

Kept from the 0.4.0 board: the catalog (bundled and from GitHub), the
saved plan and trip, the fewest links, Apply as Foundry does it, Return
to Setup, the news check and the notices.

Dropped: the tray, the drag and drop, the "which service?" helper (the
starter builds replace it).

## Data

Cards need more than the catalog carries. Each module's `module.json`
gains, under `flags["modular-av"]`:

- `facts`: up to four `[label, value]` pairs ("Table size", "Up to 6
  players"), short plain strings;
- `icon`: a Font Awesome class (`fa-solid fa-tower-broadcast`), which
  Foundry already loads.

The release's catalog generator copies them into `catalog.json`; the
core's reader checks them (lengths, the icon's form) and drops a bad
one. A catalog without them (0.4.0's) shows a kind's default icon and no
facts. The starter builds are the core's own, naming modules by id; a
build whose modules the catalog doesn't list isn't offered.

## Steps

1. Catalog: `facts` and `icon` in the manifests, the generator and the
   reader, with tests.
2. Core: the view model (stages, slots, tiles, objectives, builds) as
   pure functions over the existing plan and steps, with tests.
3. Core: the window's views (on air, chain, drawer, builds, objectives,
   setup trip), replacing `board/view-*.ts`; DOM tests.
4. Soundcheck opens the settings window on a tab (`SettingsHost` gains
   an optional tab).
5. Foundry spec (`modules.spec.ts`), screenshots, docs (HANDOFF),
   changesets, reviews.
