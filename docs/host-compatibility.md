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

Two other name surfaces are checked the same way. The durable settlement event
`assistant/message` must be in that vocabulary, because it carries the
canonical answer the channel client reports. The live typewriter text does not:
the host publishes one in-flight model attempt on the Cordis event
`agent/assistant-stream`, and this plugin's own host bridge folds those frames
into transient `assistant/chunk` entries on its `session.history` wire — the
same fold DSH's Web client performs under the name `assistant/live-chunk`.
Neither of those two names is a Session event on any host, so the check
requires them to stay *absent* from the vocabulary; a host that started writing
one durably would have its event shadowed by the bridge's transient fold. The
client reads both names, and the bridge writes the first, since a channel
runtime pointed at an explicit `baseUrl` may be reading from an earlier
install.

Cordis bus events get no load-time protection at all: `ctx.on` accepts any
string, so a host-side rename costs nothing at startup and surfaces only as a
feature that quietly stopped working — which is what the `run_code` rename did
in dsh 0.1.5. The check therefore compares the bridge's five subscriptions
(`session/event`, `agent/assistant-stream`, `agent/disposed`,
`approval/request`, `user-questions/request`) against the Cordis listener
signatures the host's own `@deepseek-ai/*` packages declare in `lib/types`,
which is where a rename necessarily appears. `npm run check:host` then runs
`test/host-live-chunk-contract.test.mjs`, which builds an attempt with the
host's own `AssistantStreamAccumulator`, drives it through the bridge and the
channel client, and asserts the deltas arrive incrementally and add up to
exactly the text the durable `assistant/message` carries. That suite skips
without `DSH_HOST_ROOT` rather than reporting a hand-written fixture as host
evidence.
On hosts that publish one, it asks the host's own `evaluatePluginCompatibility`
whether this manifest would be disabled, and checks that replacing the floor
with `^0.1.0` is refused — a passing verdict looks identical to declaring no
peers at all, so the refusal is what proves the declaration is read. The
verdict names its unmet map `requirements` on dsh 0.2.1 and `peers` on 0.2.0;
the check reads whichever the host publishes and fails on a shape it does not
recognize, because reading a field no host writes would turn the refusal above
back into a silent pass. It also reports which rule the host follows for
`engines.dsh`: dsh 0.2.1 reads an own `engines.dsh` range first and then
ignores the dsh peers entirely, while 0.2.0 ignores `engines.dsh`. This
manifest therefore declares no `engines.dsh` — one would void the peer range on
a 0.2.1 host — and `test/host-peer-range.test.mjs` guards that without a host.
It reads no user credentials and starts no bot, account authorization or update.
The plugin must use these host modules, not install duplicate DSH packages:
module-local service Symbols otherwise break host service lookup.

This contract check is deliberately separate from `npm run check`, which works
without an installed host. Missing host configuration fails explicitly rather
than reporting a skipped integration as a success. It is only partial API
evidence: it does not prove live tool registration, account authorization,
attachment rendering, restart behavior or installation/upgrade compatibility.
Full integration acceptance on any host version still awaits those checks.

The check has been run against four locally staged hosts. `0.1.3-alpha.1`
publishes `tool/code-dispatch-start`; `0.1.5-rc.2` (product line 0.5),
`0.2.0-rc.2` (product line 0.6) and `0.2.1-rc.2` (product line 0.7) publish
`tool/ptc-dispatch-start`. The client reads both names, so it keeps the tool
context on all four.

The peer-range verdict has been checked on the three hosts still resolvable
locally: `0.2.1-rc.2` and `0.2.0-rc.2` each accept the declared range and
refuse a `^0.1.0` floor, and `0.1.5-rc.2` reports no evaluator, which is the
expected 0.1 behavior and confirms the range does not change how the 0.5 line
loads the plugin. Asked about a `0.3.0-rc.1` runtime, the `0.2.1-rc.2`
evaluator reports both peers unmet, so the ceiling still excludes the next
major together with its prereleases. The `0.1.3-alpha.1` staging no
longer carries its `@deepseek-ai` packages, so the floor rests on the earlier
run against that host rather than on a fresh one.

The live-delta contract has been run on the same three resolvable hosts:
`0.1.5-rc.2`, `0.2.0-rc.2` and `0.2.1-rc.2` all declare every bus event the
bridge subscribes to, keep `assistant/message` in their vocabulary, publish
neither live-chunk name as a Session event, and pack a text attempt into the
shape the bridge expands, so one attempt's deltas stream incrementally and
settle on identical text on all three.

The browser regression runs a representative host layout in Chromium. It checks
IM title/logo behavior, both inherited typography and cleanup, rather than
modifying or restarting the user's desktop application. Existing locale unit
tests do not replace switching languages in the actual host UI; current market
metadata only changes after a new package is published.
