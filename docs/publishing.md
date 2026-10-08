# Private registry releases

The approved repository is `sobermh/tokens_DshConnect_code`; its package is
`@tokensapi/dsh-connect`, published to `https://npm.tokensapi.ai/` (Verdaccio).
Registry ACLs control access. Public source code does not imply public package
access, and public npm remains only a source for build dependencies.

## Setup and authorization

Configure the repository Actions secret `VERDACCIO_PUBLISH_TOKEN` through the
normal credential-management process. The authenticated publisher must be
`tokenscowork`; a market read-only credential cannot publish. Never commit
credentials or show `.npmrc` contents. Protect `v*` tags for release maintainers.
On a new fork, check the real Actions page for workflow enablement before an
authorized push: API `active` alone does not prove push triggers work.

Source optimization does not by itself authorize a commit, push or publication.
It does not install a package into user profiles or restart the application.

## Checks and tagged releases

`checks.yml` checks every branch push and pull request; `publish-npm.yml` accepts
only `v*` tag pushes. There is no manual dispatch release route. To retry a failed
release, re-run its original Actions run. If it already published the version,
the existence guard stops a second publish; verify the existing release before
planning any follow-up version. Do not delete or overwrite a published version.

Both workflows carry the same Node matrix (22.19.0 and 24). It covers the current
minimum and active tested LTS branches; `engines` specifies a minimum rather than
an upper cap, so later runtimes are not mechanically blocked. Extend the matrix
when adopting a new Node LTS. Passing this matrix does not certify future Node
majors. The release workflow deliberately repeats the check matrix because
`needs` cannot gate across workflow files. Its publish job depends on checks in
that same tagged run.

Dependency installation uses `npm ci --ignore-scripts` with the checked-in lock.
Checks install Chromium and run `npm run check`, which builds both entries, runs
unit tests and the browser regression, and validates package artifacts. Isolated
mock tests keep the event loop alive per test on Node 22, preserve real timer
cleanup when using fake timers, and fail stalled tests after 30 seconds. Generated
`lib/` is ignored in Git and built in CI, but remains in the published tarball.
The lock fixes build inputs; it does not constrain future host upgrades.

## Release validation

For an authorized release, add a changelog section and compare link, set the
manifest/lock version, and use the matching stable `v<version>` tag. Validation
rejects wrong repository identity, registry, package name, prerelease versions,
tag mismatches and missing bilingual market metadata.

The publish job builds and packs with `npm pack --ignore-scripts` because checks
already ran. It verifies the actual tarball's manifest, allowlisted paths,
runtime entries, CLI, patch, assets and legal files, then publishes that same
tarball with lifecycle scripts disabled and the private registry explicit.

Only the final publish step receives `NODE_AUTH_TOKEN`; setup-node supplies the
matching registry authentication configuration. Before publishing, the helper
checks publisher identity and the exact version. Only HTTP 404 confirms absence;
authentication, network and server failures stop the release. After publishing,
bounded queries check the exact package/version, `latest`, and SHA-512 integrity
against the local tarball. Pending availability is reported without republishing.
No tarballs are uploaded as public Actions artifacts.

## Installation and update boundaries

Users configure authorized registry access in the host profile. The panel uses
the host package manager's existing authentication to query the private source,
never publisher credentials or browser token storage. Installs retain preflight,
profile identity, cancellation, locking and recovery checks, and report when a
restart is required without restarting the app automatically.

New market metadata becomes visible only after a new version is published. A
package release does not itself change the market administrator's visibility or
source configuration. Local checks, remote CI, registry publication, real host
API contracts and live account/UI acceptance are separate evidence; see
[host compatibility](host-compatibility.md).
