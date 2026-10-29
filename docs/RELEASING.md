# Releasing

Each Foundry module is released on its own: tag `<module-id>-v<semver>`,
asset `<module-id>.zip`, and a stable manifest URL:

```
https://raw.githubusercontent.com/Affid/modular-av/manifests/<module-id>/module.json
```

The `manifests` branch holds only those files. (GitHub's
`releases/latest/download` can't serve this in a monorepo: "latest" is
whichever module released last.)

Beside them, `catalog.json` lists the family for the core's modules
menu: every module published on the branch (its title, description,
kind, version, family requirements and manifest URL) and the held ones
as coming soon. Each publish regenerates it (`tools/release/catalog.ts`)
and checks it with the core's own reader. The core's build ships the
same catalog of its release (`modularAV.catalog` in its package.json),
for when GitHub can't be reached.

Until 1.0 every package shares one version (Changesets "fixed" group);
from 1.0 each module has its own (below).

The starter set (`modular-av-starter-set`) has no code: its build writes
only `module.json`, its language file and the licence
(`tools/release/manifest-only.ts`), the size check skips it, and its
`flags["modular-av"].catalog: false` keeps it out of `catalog.json` (the
board plans modules one by one; a kind the cores don't know would make
them refuse the catalog). It is released with the others.

A module whose package.json has `modularAV.releaseHold` (the reason, e.g.
waiting for a third party's permission) is skipped by `pack` and refused
by `publish` until the hold is removed.

## Steps

1. Record changes as you go: `pnpm changeset`.
2. Bump versions and write changelogs: `pnpm version:packages`, then commit.
3. Check everything: `pnpm verify`, `pnpm test:services`,
   `pnpm test:foundry` and `pnpm foundry:check`; for a release that
   changes the camera background, its two-hour memory soak too
   (`MAV_SOAK_MINUTES=120 pnpm bench:camera camera-soak`).
4. `pnpm release:pending` lists the modules whose version has no tag yet,
   each after the ones it requires (the core first, the starter set
   last). Publish all of them, in that order, in one go: a module's
   manifest requires the versions it was built with, so a module published
   before what it requires would ask players for a version that isn't out
   yet.
5. For each module on that list:
   - `pnpm release:pack <module-id>` builds `release/<module-id>/`;
   - `pnpm release:publish <module-id>` checks the tree and shows the
     steps;
   - `pnpm release:publish <module-id> --yes` tags and pushes the tag,
     creates the GitHub release with the zip and `module.json`, and
     updates the manifest and `catalog.json` on the `manifests` branch.

Releases are manual while GitHub Actions is unavailable; a release workflow
can run the same script later.

## Versions from 1.0

The 1.0 release is the last in lockstep: every package gets a major
changeset, and its version commit also sets `.changeset/config.json`'s
`fixed` to `[["@modular-av/api", "@modular-av/core"]]` (the API's version
is the core's). From then on a package's version moves only when it
changes:

| A changeset on              | Releases                                   |
| --------------------------- | ------------------------------------------ |
| a plugin, the dock, a theme | that module only                           |
| `@modular-av/core` or `api` | the core (both share its version)          |
| `@modular-av/kit`           | the core and the dock, which bundle it     |
| `@modular-av/testing`       | nothing (it is private and never released) |

Plugins list `@modular-av/api` (types only) and each other in
`devDependencies`, so a new core doesn't re-release them. What a module
needs of the core or the dock is in its `module.json`: the release build
writes the version of each family module it requires, as it is in the
workspace (what the release was built and tested with), into
`relationships.requires[].compatibility.minimum`. A module released
after a new core therefore asks for that core; one that isn't released
keeps asking for what it was built with, which the new core still
satisfies (`packages/api/README.md`: a minor version only adds).

An API change is a changeset on `@modular-av/api`: a minor version for
something added, a major for anything renamed, removed or newly required
(then every plugin needs a changeset of its own, and a major version if
it now requires the new major core).

Tried on 2026-10-29 in a scratch worktree (nothing published): with that
`fixed` group, an API minor and a dock patch versioned the API and the
core to 0.10.0 and the dock to 0.9.2 and nothing else; a `kit` patch
released the core and the dock; the packed dock required core 0.10.0;
`pnpm release:pending` listed the core, then the dock.
