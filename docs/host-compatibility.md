# Host compatibility evidence

The maintenance manifest uses the open minimum `>=0.1.2-alpha.4` rather than an
enumeration of allowed host versions. Node similarly uses `>=22.19.0`. These
declarations allow future upgrades; they do not certify future behavior. The
older per-release records remain historical evidence rather than an allowlist.
Prerelease selection still follows the host's range-parser policy.

For the current local desktop staging host, the installed `dsh-tools` and
`dsh-credentials` packages are both `0.1.5-rc.2`. Run the read-only contract
check against an explicit host root:

```powershell
$env:DSH_HOST_ROOT = 'C:\path\to\dsh-plugin-desktop'
npm run check:host
```

This resolves the actual host modules, checks their runtime exports, constructs
a tool using the same API shape as the personal connectors, exercises argument
validation and structured output, and checks credential reference validation.
It reads no user credentials and starts no bot, account authorization or update.
The plugin must use these host modules, not install duplicate DSH packages:
module-local service Symbols otherwise break host service lookup.

This contract check is deliberately separate from `npm run check`, which works
without an installed host. Missing host configuration fails explicitly rather
than reporting a skipped integration as a success. It is only partial API
evidence: it does not prove live tool registration, account authorization,
attachment rendering, restart behavior or installation/upgrade compatibility.
Full `0.1.5-rc.2` integration acceptance still awaits those checks.

The browser regression runs a representative host layout in Chromium. It checks
IM title/logo behavior, both inherited typography and cleanup, rather than
modifying or restarting the user's desktop application. Existing locale unit
tests do not replace switching languages in the actual host UI; current market
metadata only changes after a new package is published.
