# Host compatibility evidence

Two manifest fields describe host compatibility, and only one of them is
enforced.

`peerDependencies` is the enforced gate. dsh 0.2 checks every
`@deepseek-ai/dsh` or `@deepseek-ai/dsh-*` peer range against the running dsh
version and disables the plugin when one is unsatisfied, reporting the reason
only on Desktop's standard error. It does not read `dsh.compatibility`, so a
manifest without these ranges declares nothing: such a plugin is neither
blocked nor protected, and an incompatible future dsh loads it anyway and fails
at runtime. The declared range is therefore two-sided,
`>=0.1.3-alpha.1 <0.3.0-0`, on the two packages the built plugin actually
imports from the host — `@deepseek-ai/dsh-tools` and
`@deepseek-ai/dsh-credentials`. The `dsh.client.inject` services are injected
by the host rather than resolved as modules, so they are not peers. Both peers
are marked optional: the host ignores `peerDependenciesMeta` entirely, so this
keeps npm and pnpm from trying to install packages the host provides without
weakening the gate.

The floor is the lowest host whose APIs were actually exercised,
`0.1.3-alpha.1`. The previous open minimum `>=0.1.2-alpha.4` was never
verified, and an open minimum on an enforced peer means "every future dsh",
which is the silent breakage this range exists to prevent. The ceiling
`<0.3.0-0` excludes the next major together with its prereleases; `^0.1.x` and
`~0.1.x` cannot express this, because semver gives them an implicit `<0.2.0-0`
bound that refuses `0.2.0-rc.2`. Raising either bound is a deliberate act that
requires running the checks below on that host first.

`dsh.compatibility` is documentation for the 0.1 line, which ships no
compatibility evaluator at all. It now states the same range so the two fields
cannot drift apart. Its per-release `dshReleases` entries, including versions
below the current floor, remain historical evidence rather than an allowlist.
Node similarly uses the open minimum `>=22.19.0`; allowing future upgrades is
not the same as certifying future behavior.

Run the read-only contract check against an explicit host root:

```powershell
$env:DSH_HOST_ROOT = 'C:\path\to\dsh-plugin-desktop'
npm run check:host
```

This resolves the actual host modules, checks their runtime exports, constructs
a tool using the same API shape as the personal connectors, exercises argument
validation and structured output, and checks credential reference validation.
It also compares the `run_code` sub-dispatch event names the Harness client
reads against the host's own `KNOWN_SESSION_EVENT_TYPES`, so a renamed event
fails here instead of silently stripping the tool context from approvals.
On hosts that publish one, it asks the host's own `evaluatePluginCompatibility`
whether this manifest would be disabled, and checks that replacing the floor
with `^0.1.0` is refused — a passing verdict looks identical to declaring no
peers at all, so the refusal is what proves the declaration is read.
It reads no user credentials and starts no bot, account authorization or update.
The plugin must use these host modules, not install duplicate DSH packages:
module-local service Symbols otherwise break host service lookup.

This contract check is deliberately separate from `npm run check`, which works
without an installed host. Missing host configuration fails explicitly rather
than reporting a skipped integration as a success. It is only partial API
evidence: it does not prove live tool registration, account authorization,
attachment rendering, restart behavior or installation/upgrade compatibility.
Full integration acceptance on any host version still awaits those checks.

The check has been run against three locally staged hosts. `0.1.3-alpha.1`
publishes `tool/code-dispatch-start`; `0.1.5-rc.2` (product line 0.5) and
`0.2.0-rc.2` (product line 0.6) publish `tool/ptc-dispatch-start`. The client
reads both names, so it keeps the tool context on all three.

The peer-range verdict has been checked on the two hosts still resolvable
locally: `0.2.0-rc.2` accepts the declared range and refuses a `^0.1.0` floor,
and `0.1.5-rc.2` reports no evaluator, which is the expected 0.1 behavior and
confirms the range does not change how the 0.5 line loads the plugin. The
`0.1.3-alpha.1` staging no longer carries its `@deepseek-ai` packages, so the
floor rests on the earlier run against that host rather than on a fresh one.

The browser regression runs a representative host layout in Chromium. It checks
IM title/logo behavior, both inherited typography and cleanup, rather than
modifying or restarting the user's desktop application. Existing locale unit
tests do not replace switching languages in the actual host UI; current market
metadata only changes after a new package is published.
