# Releasing

Each Foundry module is released on its own: tag `<module-id>-v<semver>`,
asset `<module-id>.zip`, and a stable manifest URL:

```
https://raw.githubusercontent.com/Affid/modular-av/manifests/<module-id>/module.json
```

The `manifests` branch holds only those files. (GitHub's
`releases/latest/download` can't serve this in a monorepo: "latest" is
whichever module released last.)

Until 1.0 every package shares one version (Changesets "fixed" group).

## Steps

1. Record changes as you go: `pnpm changeset`.
2. Bump versions and write changelogs: `pnpm version`, then commit.
3. Check everything: `pnpm ci` and `pnpm foundry:check`.
4. For each module:
   - `pnpm release:pack <module-id>` builds `release/<module-id>/`;
   - `pnpm release:publish <module-id>` checks the tree and shows the
     steps;
   - `pnpm release:publish <module-id> --yes` tags and pushes the tag,
     creates the GitHub release with the zip and `module.json`, and
     updates the manifest on the `manifests` branch.

Releases are manual while GitHub Actions is unavailable; a release workflow
can run the same script later.
