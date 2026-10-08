# Plugin maintenance checks — 2026-10-08

This records local validation of optimization before publication using the
`tokenscowork-plugin-dev` skill. At validation, the manifest was 2.9.1 and these
changes were not part of that registry release. They were subsequently published
as 2.9.2. At the time of local validation, no commit, push, release,
profile installation or application restart had been performed. Changes are confined to the
independent plugin repository.

## Implemented

- Bilingual market display name and summary with validation; English README
  moved into docs, with its relative links and documentation images packaged.
- Separate branch/PR checks and tag-only private releases, matching Node
  matrices, frozen installs, guarded publisher identity/version checks and
  post-release integrity/latest validation.
- Authenticated private metadata queries through the host package manager,
  including installation revalidation; corrected manual package/registry command
  and retained profile, version, cancellation, locking and recovery checks.
- Open minimum Node/host requirements rather than an exact-version allowlist.
  Locked build dependencies provide reproducibility independently of host
  compatibility. Declared minima do not certify future runtime behavior.
- Generated lib removed from Git tracking while retaining local build outputs
  and package entries. Standard checks build from source and run the Chromium
  regression. Test lifecycle setup supports Node 22 unreferenced timeouts and
  real timer cleanup under fake timers, with explicit failure deadlines.
- Changelog history, release documentation and reviewed upstream fingerprints
  updated to describe the actual changes.

## Executed evidence

| Check | Result |
| --- | --- |
| `npm run check`, Node 24.18.0 | 3006 passed, 7 platform skips, 0 failed/cancelled |
| Same command with `volta run --node 22.19.0` | 3006 passed, 7 platform skips, 0 failed/cancelled |
| Chromium fixture on both runtimes | 7 browser checks passed, including typography and unload restoration |
| Actual `npm pack --ignore-scripts` tarball | 22 files; manifest, entries, CLI, patch, assets, docs and legal files verified |
| Frozen install / updated lock dry run | Passed with lifecycle scripts disabled |
| Real host API contract | dsh-tools and dsh-credentials 0.1.5-rc.2 passed export, argument, output and credential-reference checks |
| Read-only query through desktop profile package-manager authentication | Private registry returned @tokensapi/dsh-connect 2.9.1; returned metadata passed release validation |
| Release guards | Mocked wrong identity, existing version, denied/error queries, pending availability, wrong integrity and wrong latest covered |
| Pinned upstream source audit | 485 equal, 34 explicitly reviewed differences, 62 fork-only, none missing/unreviewed |
| README relative links and whitespace | Passed |

Logs and the unpublished tarball are under ignored `.build/optimization-*` paths.
Generated files are removed from Git tracking; their local build outputs remain
present. This record describes the local validation state before submission.

## Remaining acceptance boundaries

At local validation, no remote run of the new workflows or new publication had been performed.
Actual host RPC update/install, live bot/account integration, restart behavior,
and Chinese/English switching in the real host UI were not exercised. The real
package-manager metadata query and API contract do not replace these checks.
Market metadata becomes effective only after a future release.

Dependency audit reports four existing advisories: axios (high), qs (moderate),
sharp (high) and undici (high). The newly introduced YAML development dependency
was upgraded to 2.9.1 to eliminate its reported advisory. No broad audit-fix was
applied to the existing runtime dependency tree.

The local installed plugin was observed at 2.9.1 during the final read-only
inspection. This work did not change it or restore a different version.

## Release follow-up

Version 2.9.2 was published to `https://npm.tokensapi.ai/` from tag `v2.9.2`,
release commit `05de4dd81528f896c3a4abf2069dde3f261b0dc8`. Both Node matrix
checks and the publish job completed successfully in the
[release workflow](https://github.com/sobermh/tokens_DshConnect_code/actions/runs/37755136971).
The [branch checks](https://github.com/sobermh/tokens_DshConnect_code/actions/runs/37755136924)
also passed.

Independent authenticated registry queries confirmed the exact version and
`latest` as 2.9.2. The downloaded published tarball contained 22 allowed files;
its SHA-512 matched registry integrity, and the manifest contained the expected
bilingual metadata and open minimum runtime ranges. This confirms the published
package, not language switching or catalog rendering in a live host UI.
No local plugin installation or application restart was performed.
