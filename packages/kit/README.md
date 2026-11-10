# @modular-av/kit

Small helpers that UI modules bundle, so no two of them write the same
one: building elements, fitting camera tiles into a space, dragging and
resizing, keeping things on screen, placing popovers, drawing a level
meter, moving focus with the arrow keys.

It is a library, not a Foundry module: it has no Foundry id and no zip
of its own. A module that imports from it gets only the functions it
uses, bundled into its own file.

## Inside this package

- **Code**: about 1,200 lines in 12 files, one per helper (`fit.ts`,
  `drag.ts`, `popover.ts`, `meter.ts`, `roving.ts` and so on).
- **Rules**: pure helpers only. Nothing here keeps state between calls,
  talks to the core or to Foundry, or opens a connection. Anything that
  must exist once per page belongs to the core
  ([docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), "The
  repository").
- **Third-party code**: none.
- **Tests**: 7 unit test files (`pnpm vitest run packages/kit`).

## Licence

MIT.
