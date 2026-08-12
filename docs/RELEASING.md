# Releasing

Four workflows make up the release process. Three of them build or publish
something; one keeps version metadata in step.

| Workflow | Fires on | Produces |
| --- | --- | --- |
| `tests.yml` | push to `main`/`dev`, any pull request | nothing — the gate |
| `desktop-release.yml` | a published release, a `staging` push, a `v*-rc*` tag | desktop bundles for macOS arm64/x64, Linux x64, Windows x64 |
| `container-release.yml` | a published release | `ghcr.io/timeworthy/ikmal-editor` |
| `release.yml` | a published release | syncs `version.json` |

## The rule that decides where workflows can run from

GitHub registers `workflow_dispatch` and `release` triggers **only from the
default branch**. A workflow that lives on a feature branch and listens for
those events does not exist as far as GitHub is concerned: dispatching it
answers `404`, and publishing a release runs nothing.

`push` is the exception. A push event resolves the workflow file from the ref
being pushed, so a push-triggered workflow runs from any branch or tag.

This is not a footnote. Until `.github/workflows/` reaches `main`, publishing a
release builds no desktop bundles and pushes no container image, silently.

## Rehearsing a release

Because of that rule, the desktop pipeline can be exercised without a release
and without touching `main`. Both paths build and archive exactly as a real
release does, then keep the bundles as workflow artifacts for seven days
instead of publishing them. Nothing public is created.

**Iterating on the workflow itself** — push to `staging`. The branch is not
kept between rehearsals; the push creates it, and deleting it afterwards stops
a stale ref sitting there triggering four-platform builds. The trigger stays in
the workflow either way, so this works whenever you need it:

```bash
git push origin dev:staging --force-with-lease
gh run watch "$(gh run list --workflow 'Build desktop release bundles' --limit 1 --json databaseId --jq '.[0].databaseId')"
```

**Rehearsing against a frozen tree** — push a release-candidate tag:

```bash
git fetch origin && git switch main && git merge --ff-only origin/main
git tag v0.9.1-rc1 main
git push origin v0.9.1-rc1
```

Fetch first. A tag cut from a stale local `main` packages the tree that ref
points at, not the one you just pushed — including an older copy of this
workflow, so a guard you added moments earlier simply is not there.

An `-rc` tag is the more faithful test: the workflow checks out the tag, so it
packages exactly what that tag contains. Delete it when finished:

```bash
git push origin :refs/tags/v0.9.1-rc1 && git tag -d v0.9.1-rc1
```

Download the bundles from the run's Artifacts section to check them before
anything is published, then delete the branch or tag you used:

```bash
git push origin --delete staging
```

An `-rc` tag is the better lock-in of the two. A branch moves; a tag names one
frozen tree, which is what you want to rehearse and then publish.

## Cutting a real release

1. Bump the version. `appVersion` in `main.go` and `version` in
   `desktop/package.json` must match each other — `package_desktop.mjs` refuses
   to build otherwise — and must match the tag you are about to cut.
   `version.json` is synced automatically by `release.yml` on publish.
2. Merge to `main`. Confirm `tests.yml` is green on the merge commit.
3. Rehearse with a `v*-rc*` tag and inspect the artifacts. The workflow checks
   that the tag, with `-rc*` stripped, matches `appVersion`, so a tag cut
   without a bump fails here rather than shipping binaries that report the
   previous version.
4. Publish the release. `desktop-release.yml`, `container-release.yml`, and
   `release.yml` all fire on `release: published`.
5. Update the install manifests. `Formula/ikmal-editor.rb` and
   `scoop/ikmal-editor.json` carry `sha256` values for the **server/CLI**
   archives, not the desktop bundles, and those checksums must match the assets
   actually attached to the release. A rebuild that changes them without a
   matching manifest update breaks `brew install`.

## Things worth knowing before you rely on it

- **Asset names do not collide.** The desktop bundles are
  `ikmal-editor-<tag>-desktop-<platform>-<arch>`; the server archives the
  Homebrew formula points at are `ikmal-editor-<tag>-<platform>-<arch>`. The
  upload uses `--clobber`, which only ever replaces a same-named asset.
- **The bundle directory name is discovered, not spelled.** It comes from
  `name: 'ikmal editor'` in `desktop/package_desktop.mjs`. The archive steps
  match on the `-<platform>-<arch>` suffix, because a hardcoded copy of that
  name in the wrong case once passed on macOS and Windows and would have failed
  on Linux.
- **A tag has to contain the workspace root.** The workflow checks out the tag
  being released, and `npm run verify` and `npm run package` both build the
  portable packages with `tsc`, which the root `package.json` supplies. A tag
  cut before the workspace existed cannot be built by this pipeline.
- **Runner images expire.** `darwin/x64` is cross-packaged on `macos-14`
  rather than built on `macos-13`, which GitHub retired: that job sat queued
  with no runner while every other one finished, and during a real release it
  would have done so for six hours before timing out. A matrix entry naming a
  retired image fails by hanging, not by erroring.
- **The Office private key is not restricted on Windows.**
  `office-bridge/certificate.cjs` chmods the generated key to `0600`, which
  Node applies only on POSIX; on Windows it toggles the read-only attribute and
  the key reads back as `0666`. Restricting it there means setting an ACL, which
  the bridge does not do. `tools/office_certificate.test.mjs` asserts the mode
  on POSIX only, and says why, so the gap is recorded rather than hidden behind
  a red test.
- **Signing is not set up.** Packaged macOS apps carry an ad-hoc signature with
  no team identifier; `codesign --verify --deep --strict` and `spctl --assess`
  both fail. Distribution to anyone who is not prepared to bypass Gatekeeper
  needs a certificate, entitlements, and notarization first.
