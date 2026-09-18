# Private registry releases

This public source repository publishes packages to `https://npm.tokensapi.ai/`
(Verdaccio), not npmjs.com. Public source and previously published npmjs versions
remain public. Verdaccio access is enforced by its server ACL, not npm's access flag.

## One-time setup

Set the GitHub repository Actions secret `VERDACCIO_PUBLISH_TOKEN` to a valid
Verdaccio token issued for the approved `tokenscowork` publisher. A `market`
read-only credential cannot publish. Use `npm login --auth-type=legacy
--registry=https://npm.tokensapi.ai/` to obtain a publisher session through your
normal credential-management process. Never commit `.npmrc` credentials or paste
tokens into logs. Tokens expire and must be rotated when needed.

Protect `v*` tags with repository rulesets so only release maintainers can create
them. Keep Actions enabled for this fork. This registry uses a secret-backed token;
npmjs Trusted Publishing/OIDC is not configured for Verdaccio.

## Release

1. Update the version in package.json and package-lock.json together, review and
   commit the intended changes, and push main.
2. Create and push a matching stable tag, for example `v2.9.0` for version `2.9.0`.
3. CI validates tag/package/registry identity, installs public build dependencies,
   runs tests, builds, verifies the package, packs it, and publishes to Verdaccio.

Branch pushes, pull requests and manual CI runs without `release_tag` only check.
If the tag push does not create a run, dispatch the current main workflow with an
existing release tag:

```sh
gh workflow run ci.yml --ref main -f release_tag=v2.9.0
```

This checks out `refs/tags/v2.9.0`, validates its package identity, and runs the full
checks before publishing. It does not publish the current main checkout or move
the tag. Push and manual releases share a per-tag concurrency group.
Prereleases cannot move `latest`. Authentication is exposed only in the publish
step; publishing disables lifecycle scripts because checks/build already ran.
No tarballs are uploaded as public GitHub artifacts or release assets.
An existing version is not overwritten; use a new version after a published fix.

Publishing does not change market visibility or switch an existing market entry
from npmjs to the self-hosted source. That is a separate administrator operation.
Users install/update through the market; never distribute the publisher token.
The plugin's imported upstream in-panel updater still targets npmjs; this CI change
does not migrate that separate update mechanism to authenticated market delivery.
