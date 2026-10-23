# Third-party notices

Modular A/V is licensed under the MIT License (see `LICENSE`). It contains no
code under the Hippocratic License; see `docs/HANDOFF.md` §2 for the rules.

Each Foundry module ships its own `THIRD-PARTY-NOTICES.md` inside its zip,
listing the third-party code bundled into that module and its licence. A
module that bundles no third-party code says so.

| Module               | Notices                                   |
| -------------------- | ----------------------------------------- |
| `modular-av`         | `packages/core/THIRD-PARTY-NOTICES.md`    |
| `modular-av-livekit` | `packages/livekit/THIRD-PARTY-NOTICES.md` |

The build appends every bundled package, with its licence texts, to the copy
inside each zip, and fails if one is under a licence other than MIT, ISC,
0BSD, BSD or Apache-2.0.

Development tools (TypeScript, Vite, Vitest, ESLint, Prettier, Playwright,
Changesets and their dependencies) are used to build and test the modules
and are not distributed with them.
