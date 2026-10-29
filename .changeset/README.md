# Changesets

Every change a player or module author would notice gets a changeset:
`pnpm changeset`, pick the packages, describe the change. Until 1.0 all
packages share one version ("fixed" group); `pnpm changeset version` bumps
them together and writes the changelogs. From 1.0 each package has its
own version (see "Versions from 1.0" in `docs/RELEASING.md`): pick only
the packages that changed. Releases: `docs/RELEASING.md`.
