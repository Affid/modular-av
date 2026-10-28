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

Until 1.0 every package shares one version (Changesets "fixed" group).

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
4. For each module:
   - `pnpm release:pack <module-id>` builds `release/<module-id>/`;
   - `pnpm release:publish <module-id>` checks the tree and shows the
     steps;
   - `pnpm release:publish <module-id> --yes` tags and pushes the tag,
     creates the GitHub release with the zip and `module.json`, and
     updates the manifest and `catalog.json` on the `manifests` branch.

Releases are manual while GitHub Actions is unavailable; a release workflow
can run the same script later.
