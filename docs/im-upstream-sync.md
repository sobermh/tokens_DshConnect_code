# IM upstream synchronization

## Baseline and scope

- Upstream: https://github.com/xmanrui/dsh-im
- Integrated target: v4.21.2, `34a370bfef1fcf577327b822d2091d2157ded0f8`.
- Fork baseline: `2232cf6bad6fb45058ad793d0df6dbbfb7b0de25`.
- Scope: all upstream `src/`, `plugin-src/`, and `test/` files, with explicitly
  reviewed fork differences. This is integration, not a claim of byte identity.
- No outer product changes, installed-profile changes, publishing, or commits.

The earlier selective sync omitted the upstream Session snapshot file-return
fix. The attachment path now matches upstream, including `snapshotEvents()`,
observed turn tracking, and queued-versus-delivered wording. WhatsApp document
tests exercise both legacy events and current snapshots.

## Integrated functionality

All existing IM channels receive the upstream routing, reconnect, message,
file, context, model, workspace, and interaction changes. Host activation and
settings also include WeCom applications, AI Office, proactive delivery,
Session synchronization, access policy, inbound-file TTL, interface language,
bot aliases, and model/context settings. Upstream experimental labels remain.

`plugin-src/host/upstream-im.mjs` and `plugin-src/client/upstream-im.js` retain
upstream composition, with narrow extension points. The fork entrypoints own
connection-center navigation, personal Feishu/DingTalk authorization, and the
single shared Feishu application service. An application-service failure does
not stop unrelated channels.

Telegram uses upstream single-choice cards and retains fork multi-select and
approval buttons. Both callback formats use one long poll and the same inbound
access policy. Existing actor, chat, message, stale-button, retry, and duplicate
submission checks remain covered.

## Intentional exceptions

- QQ QR setup remains excluded: `@tencent-connect/qqbot-connector` 1.2.0 still
  declares `UNLICENSED`. QQ manual AppID/AppSecret setup and messaging remain.
- The updater targets `@tokensapi/dsh-connect`, including registry validation,
  tarball identity, install command, and its own recovery-journal directory.
- Windows journal replacement retries only transient EPERM/EACCES/EBUSY errors,
  with a bounded delay; it never deletes the destination or bypasses recovery.
- Fork authorization translations, shared application UI, package identity,
  and Telegram multi-select/approval behavior remain intentional differences.
- Tests target the upstream composition and fork wrapper independently. CRLF
  normalization in dictionary-source checks supports Windows checkouts.

`im-upstream-exceptions.json` records reasons and normalized SHA-256 fingerprints.
Changing a reviewed file invalidates its exception instead of silently allowing
all future differences at that path. `im-upstream-audit.json` is the inventory:
485 equal files, 34 reviewed differences, 62 fork-only files, no missing upstream
files or unreviewed differences.

## Verification and maintenance

Run in the plugin repository:

```powershell
npm test
npm run build
node scripts/verify-package.mjs
node scripts/audit-im-upstream.mjs 34a370bfef1fcf577327b822d2091d2157ded0f8 --check
```

The audit needs the pinned upstream Git object available locally. On the next
sync, fetch and pin the target, compare the entire source tree, explicitly
review retained differences, update fingerprints, and run both upstream and
fork tests. Do not infer synchronization from commit titles alone.

Desktop (1200px) and narrow (390px) mock previews were checked with Playwright:
IM navigation and authorization switch correctly, with no page errors or
horizontal overflow. This does not replace live account verification.
Full regression: 2,998 tests, 2,991 passed, 7 platform-dependent skips, 0 failures.
Build, package verification, and the pinned upstream audit passed.
No live WhatsApp upload, Telegram bot connection, or macOS run was performed.

The dependency audit still reports existing transitive `qs` (moderate) and
`sharp` (high) advisories. This sync does not claim to resolve those advisories.
