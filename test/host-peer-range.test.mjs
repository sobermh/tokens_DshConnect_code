import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import semver from 'semver';

import { assertDshDependencyPolicy } from '../scripts/dsh-dependency-policy.mjs';

// dsh 0.2 decides compatibility from `peerDependencies` alone: it checks every
// `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*` range against the running dsh
// version and disables the plugin when one is unsatisfied. `dsh.compatibility`
// is not read there, so a manifest without these ranges declares nothing and
// gets no protection at all -- it loads on a host it was never built for and
// fails at runtime. These cases guard the shape of that declaration using the
// host's own semver policy (prereleases participate in ranges).
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Mirrors the host's own name filter in evaluatePluginCompatibility.
const isHostPeer = (name) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-');
const hostPeers = Object.entries(manifest.peerDependencies ?? {}).filter(([name]) => isHostPeer(name));
const satisfies = (version, range) => semver.satisfies(version, range, { includePrerelease: true });

// Hosts whose APIs this plugin was actually exercised against; see
// docs/host-compatibility.md. The floor must not reach below these.
const VERIFIED_HOSTS = ['0.1.3-alpha.1', '0.1.5-rc.2', '0.2.0-rc.2', '0.2.1-rc.2'];
// 0.1.2-alpha.4 is the historical `dsh.compatibility` minimum that nobody
// verified; the next major is out of scope until someone runs the checks.
const OUT_OF_RANGE_HOSTS = ['0.1.2-alpha.4', '0.3.0-rc.1', '0.3.0', '1.0.0'];

test('the plugin declares a host peer range at all', () => {
  assert.ok(hostPeers.length > 0, 'peerDependencies must name at least one @deepseek-ai/dsh* package');
  // Only packages the built plugin really imports from the host belong here.
  // The `dsh.client.inject` services are injected by the host, not resolved as
  // modules, so they are not peers.
  assert.deepEqual(hostPeers.map(([name]) => name).sort(), [
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-tools',
  ]);
});

test('every host peer range is double-ended and excludes the next major prereleases', () => {
  for (const [name, range] of hostPeers) {
    assert.ok(semver.validRange(range, { includePrerelease: true }), `${name}: ${range} is not a valid range`);
    // An open minimum is fine for `engines`; for a host peer it means "every
    // future dsh", which is exactly the silent-breakage this ticket is about.
    assert.match(range, /^>=\S+ <\S+-0$/, `${name}: ${range} must be ">=<floor> <<next major>-0"`);
    // `^0.1.x` and `~0.1.x` get an implicit `<0.2.0-0` upper bound, so they are
    // refused on 0.2.0-rc.2 even though this plugin supports it (T0007).
    assert.doesNotMatch(range, /[\^~]/, `${name}: ${range} must not use caret or tilde`);
  }
});

test('the declared ranges accept the verified hosts and nothing beyond them', () => {
  for (const [name, range] of hostPeers) {
    for (const version of VERIFIED_HOSTS) {
      assert.ok(satisfies(version, range), `${name}: ${range} must accept the verified host ${version}`);
    }
    for (const version of OUT_OF_RANGE_HOSTS) {
      assert.ok(!satisfies(version, range), `${name}: ${range} must not vouch for ${version}`);
    }
  }
});

test('caret and tilde floors would lock this plugin out of dsh 0.2', () => {
  // Keeps the reason for the explicit two-sided range in the suite rather than
  // only in a comment: if this ever stops holding, the rule above can relax.
  for (const range of ['^0.1.3-alpha.1', '~0.1.3-alpha.1', '^0.1.0']) {
    assert.ok(!satisfies('0.2.0-rc.2', range), `${range} unexpectedly accepts 0.2.0-rc.2`);
  }
});

test('the manifest declares no engines.dsh, which would silence the peer gate', () => {
  // dsh 0.2.1 reads an own `engines.dsh` range first and then ignores the dsh
  // peers entirely; dsh 0.2.0 ignores `engines.dsh` and reads only the peers.
  // So declaring one here would void the range above on a 0.7 host while every
  // other case in this file still passed. `dsh.compatibility.dsh` is a
  // different field and is not read by either gate.
  assert.ok(
    !Object.hasOwn(manifest.engines ?? {}, 'dsh'),
    'engines.dsh must stay undeclared: on dsh 0.2.1 it replaces the peer check instead of adding to it',
  );
});

test('host peers are optional so package managers do not try to install the host', () => {
  // The host ignores `peerDependenciesMeta` entirely -- it has no occurrence of
  // that field -- so marking these optional keeps npm/pnpm quiet about peers the
  // host provides without weakening the host's own gate.
  for (const [name] of hostPeers) {
    assert.equal(manifest.peerDependenciesMeta?.[name]?.optional, true, `${name} must be an optional peer`);
  }
});

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('no DSH package is installed alongside the plugin', () => {
  // The plugin must use the host's own modules: a second copy of a dsh package
  // in this tree carries its own service Symbols and breaks host service
  // lookup. Dropping `optional` above would make npm resolve these peers and
  // install exactly that duplicate, so assert on the resolved tree, not intent.
  const installed = Object.keys(lock.packages ?? {}).filter((path) => /(^|\/)@deepseek-ai\/dsh(-|$)/.test(path));
  assert.deepEqual(installed, [], `dsh packages must not be installed here: ${installed.join(', ')}`);
  assert.equal(lock.version, manifest.version, 'package-lock.json must match the manifest version');
});

test('the shipped manifest and lockfile satisfy the duplicate-DSH policy', () => {
  assertDshDependencyPolicy(manifest, lock);
});

test('the duplicate-DSH policy rejects every way a second copy could arrive', () => {
  const range = '>=0.1.3-alpha.1 <0.3.0-0';
  const optionalPeer = {
    peerDependencies: { '@deepseek-ai/dsh-tools': range },
    peerDependenciesMeta: { '@deepseek-ai/dsh-tools': { optional: true } },
  };
  for (const [label, change] of [
    ['a runtime dependency', { dependencies: { '@deepseek-ai/dsh-tools': range } }],
    ['a dev dependency', { devDependencies: { '@deepseek-ai/dsh-session': range } }],
    ['an optional dependency', { optionalDependencies: { '@deepseek-ai/dsh-credentials': range } }],
    ['a bundled package', { bundleDependencies: ['@deepseek-ai/dsh-tools'] }],
    // The exception is narrow: a required peer is what makes npm resolve and
    // install the duplicate, so it stays refused. `peerDependenciesMeta` must
    // be cleared here, or the real manifest's entry would still mark it
    // optional and this case would prove nothing.
    ['a required peer', {
      peerDependencies: { '@deepseek-ai/dsh-tools': range },
      peerDependenciesMeta: {},
    }],
    ['a peer marked non-optional', {
      ...optionalPeer,
      peerDependenciesMeta: { '@deepseek-ai/dsh-tools': { optional: false } },
    }],
    ['a required bare dsh peer', { peerDependencies: { '@deepseek-ai/dsh': range } }],
  ]) {
    assert.throws(() => assertDshDependencyPolicy({ ...manifest, ...change }, lock), undefined, label);
  }
  // An installed copy is refused even when the manifest looks clean -- that is
  // the invariant the declaration rules only protect indirectly.
  assert.throws(() => assertDshDependencyPolicy(
    { ...manifest, ...optionalPeer },
    { packages: { '': {}, 'node_modules/@deepseek-ai/dsh-tools': { version: '0.2.0-rc.2' } } },
  ));
  // And the declaration this ticket adds is accepted.
  assertDshDependencyPolicy({ ...manifest, ...optionalPeer }, { packages: { '': {} } });
  // `@deepseek-ai/cordis` is not a DSH runtime package and stays installable.
  assertDshDependencyPolicy({ ...manifest, devDependencies: { '@deepseek-ai/cordis': '4.0.1' } }, lock);
});

test('the 0.1-line compatibility record agrees with the enforced peer range', () => {
  // dsh 0.1 has no compatibility function, so this field is documentation; a
  // floor that disagrees with the enforced range is a trap for the next reader.
  const [, range] = hostPeers[0];
  assert.equal(manifest.dsh.compatibility.dsh, range);
  for (const [name, declared] of hostPeers) assert.equal(declared, range, `${name} must use the same range`);
  // The per-release records stay as historical evidence, including versions
  // below the floor; see docs/host-compatibility.md.
  assert.equal(manifest.dsh.compatibility.dshReleases['0.1.3-alpha.1'], 'compatible');
});
