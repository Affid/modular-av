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
     creates the GitHub release with the zip and `module.json`, updates
     the manifest and `catalog.json` on the `manifests` branch, and sends
     the version to foundryvtt.com if the module is listed there (below).

Releases are manual while GitHub Actions is unavailable; a release workflow
can run the same script later.

## foundryvtt.com

Since Foundry 14.366, Foundry looks for a listed package's updates on
foundryvtt.com rather than at its manifest URL. A version that isn't
sent there never reaches the people who installed the module from
Foundry's package list. The manifests branch keeps serving those who
installed it by URL.

Each listed package has its own release token: the **Package Release
Token** on its page on foundryvtt.com, just above **Save Package**. Put
it in `.env.local` as `FOUNDRY_RELEASE_TOKEN_<ID>`, with the module id in
capitals and its dashes as underscores (`FOUNDRY_RELEASE_TOKEN_MODULAR_AV`
for the core, `FOUNDRY_RELEASE_TOKEN_MODULAR_AV_DOCK` for the dock). It
is a secret: never commit or print it, and if it leaks, use **Refresh** on
the package's page.

`pnpm release:publish <module-id> --yes` sends the version through
Foundry's [package release API](https://foundryvtt.com/article/package-release-api/)
whenever the module's token is set, and only says so when it isn't. A
prerelease isn't sent. The request names the GitHub release's own
`module.json` (one URL per version, as Foundry asks) and the module's
changelog at the release's tag. Its `compatibility` comes from that
manifest, so `maximum` stays unset unless the manifest sets it. If
Foundry already has the version, that counts as done, so a publish can be
re-run.

To send a version that is already on GitHub (the current one, right
after Foundry approves a listing, or one whose sending failed):

- `pnpm release:listing <module-id>` asks Foundry to check the request
  without saving it (a dry run);
- `pnpm release:listing <module-id> --yes` saves it.

Foundry refuses more than one release of a package a minute (HTTP 429);
the error says how long to wait.

## Development builds

To try a branch on a real server before it's released (a PR, say),
`pnpm release:dev` publishes the checkout as the GitHub prerelease `dev`:

- `pnpm release:dev [module-id...]` builds the named modules (every one
  not held back if none is named), plus the family modules they require,
  into `release/dev/` and shows what it would publish;
- `pnpm release:dev [module-id...] --yes` deletes the last `dev` release
  and its tag, and creates it again at HEAD with each module's
  `<module-id>.zip` and `<module-id>.json` (its manifest).

The tree must be clean and HEAD pushed, so the release matches a commit
on GitHub. Each build gets the version `<version>-dev.<UTC time>` (e.g.
`0.12.0-dev.20261112153045`) and "(dev)" in its title. Foundry counts it
newer than the version it's built from and older than the next release,
so it never offers the released version as an "update", and the next
release replaces it. Family modules it requires point at their dev
manifests, so installing the dock's installs the core's.

Install in Foundry with the manifest URL that `--yes` prints and the
release notes list, one for each build:

```
https://github.com/Affid/modular-av/releases/download/dev/<module-id>.json?v=<version>
```

GitHub may answer a release download address it has already seen with the
file it found then, for up to an hour after the `dev` release is replaced:
an installed dev build's update check, or an install from the address
without `?v=`, can get the last build. An address unique to the build
can't, so each build's manifest also points at its zip, and at the family
manifests it requires, with `?v=<version>`; a manifest always installs its
own zip. `?v=` with anything new works too.

A module installed that way checks for updates at the address without
`?v=`, so Foundry's Update button finds the next dev build, but possibly
only after that hour. The core doesn't: it's listed on foundryvtt.com, and
Foundry looks for a listed package's updates there. To have a build at
once, install it again from its printed URL; if Foundry won't install over
a module, uninstall it first (a world keeps its settings).

It isn't private: anyone can see the release on GitHub. But nothing
leads players to it. It is never on the `manifests` branch or in
`catalog.json`, never sent to foundryvtt.com, and never marked latest.

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
