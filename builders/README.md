# Rival Shift builders

These scripts are Windows entry points for building and publishing Rival Shift. Run the `.cmd` files by double-clicking them or from a terminal. The matching `.ps1` files contain the implementation and expose optional parameters.

## Build the installer

```powershell
.\builders\build-installer.cmd
```

Runs type-checking, the production build, all tests, and the custom installer compiler. Output is written to `release/`. Pass `-SkipTests` only when you intentionally want a faster local package. A global pnpm installation is not required: when pnpm is absent from PATH, the builder uses Corepack and the pnpm version pinned in `package.json`.

## Release the latest build

```powershell
.\builders\release-latest.cmd
```

Publishes the artifacts matching the version in `package.json` to the configured GitHub repository. It validates `latest.yml`, generates a SHA-256 checksum file, creates a new `v<version>` release, or replaces the assets on an existing release. The GitHub CLI must be installed and authenticated with `gh auth login`.

New tags target the public `main` branch by default, keeping the local source branch out of the public release. Use `-Target <branch-or-commit>` only when you intentionally need a different public target.

Useful options:

```powershell
.\builders\release-latest.cmd -DryRun -AllowDirty
.\builders\release-latest.cmd -NotesFile .\release-notes.md
.\builders\release-latest.cmd -Target main
.\builders\release-latest.cmd -Draft
.\builders\release-latest.cmd -Prerelease
.\builders\release-latest.cmd -RequireClean
```

Because releases contain compiled artifacts and new tags target public `main`, a dirty local source tree produces a warning but does not block publishing. Use `-RequireClean` when you explicitly want the release to fail unless every local change has been committed. `-AllowDirty` remains available to override strict mode in automated wrappers.

## Build and release

```powershell
.\builders\build-and-release.cmd
```

Runs the complete installer build and then publishes it. It accepts the same release options plus `-SkipTests`.
