import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseDocument } from 'yaml';
import semver from 'semver';
import { validateRelease, validateMarketMetadata, RELEASE_REPOSITORY } from '../scripts/validate-release.mjs';
import { assertUnpublishedStatus, registryRelease } from '../scripts/registry-release.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = name => {
  const doc = parseDocument(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8'));
  assert.deepEqual(doc.errors, []);
  return doc.toJS();
};

test('branch checks and tag publishing are separate, gated workflows', () => {
  const checks = workflow('checks.yml');
  const release = workflow('publish-npm.yml');
  assert.deepEqual(checks.on, { push: { branches: ['**'] }, pull_request: null });
  assert.deepEqual(release.on, { push: { tags: ['v*'] } });
  assert.deepEqual(release.jobs.check.strategy.matrix, checks.jobs.check.strategy.matrix);
  assert.equal(release.jobs.publish.needs, 'check');
  assert.ok(release.jobs.publish.if.includes(`github.repository == '${RELEASE_REPOSITORY}'`));
  assert.ok(release.jobs.publish.if.includes("startsWith(github.ref, 'refs/tags/v')"));
  assert.equal(checks.concurrency['cancel-in-progress'], true);
  assert.equal(release.concurrency['cancel-in-progress'], false);
  for (const w of [checks, release]) {
    assert.deepEqual(w.permissions, { contents: 'read' });
    assert.equal(w.concurrency.group, '${{ github.workflow }}-${{ github.ref }}');
    for (const job of Object.values(w.jobs)) {
      const checkout = job.steps.find(s => s.uses?.startsWith('actions/checkout@'));
      assert.equal(checkout.with['persist-credentials'], false);
      assert.ok(job.steps.some(s => s.run === 'npm ci --ignore-scripts --registry=https://registry.npmjs.org/'));
    }
    for (const value of w.jobs.check.strategy.matrix.node) assert.ok(semver.satisfies(value === '24' ? '24.0.0' : value, manifest.engines.node));
    assert.deepEqual(w.jobs.check.strategy.matrix.node, ['22.19.0', '24']);
    assert.ok(w.jobs.check.steps.some(s => s.run === 'npx playwright install --with-deps chromium'));
    assert.ok(w.jobs.check.steps.some(s => s.run === 'npm run check'));
    assert.ok(w.jobs.check.steps.every(s => !s.env?.NODE_AUTH_TOKEN));
  }
  const publish = release.jobs.publish.steps.at(-1);
  assert.equal(publish.env.NODE_AUTH_TOKEN, '${{ secrets.VERDACCIO_PUBLISH_TOKEN }}');
  assert.ok(publish.run.indexOf('registry-release.mjs check') < publish.run.indexOf('npm publish'));
  assert.ok(publish.run.includes('npm publish .release/*.tgz --ignore-scripts --registry=https://npm.tokensapi.ai/ --tag=latest'));
  assert.ok(publish.run.includes('registry-release.mjs verify .release/*.tgz'));
  assert.ok(release.jobs.publish.steps.some(s => s.run?.includes('npm pack --ignore-scripts')));
});

test('release identity, bilingual market metadata and stable tag match', () => {
  assert.equal(validateRelease(manifest, `v${manifest.version}`), manifest.version);
  validateMarketMetadata(manifest);
  for (const tag of ['main', 'v9.9.9', '', undefined]) assert.throws(() => validateRelease(manifest, tag));
  for (const change of [
    { name: '@other/plugin' },
    { repository: { url: 'https://github.com/other/repository.git' } },
    { repository: { url: 'https://github.com.evil.test/sobermh/tokens_DshConnect_code.git' } },
    { publishConfig: { registry: 'https://registry.npmjs.org/' } },
    { publishConfig: { ...manifest.publishConfig, access: 'public' } },
    { version: `${manifest.version}-beta.1` }, { version: `0${manifest.version}` },
    { tokenscowork: { ...manifest.tokenscowork, displayName: { 'zh-CN': '连接中心', 'en-US': '连接中心' } } },
    { tokenscowork: { ...manifest.tokenscowork, summary: { 'zh-CN': '', 'en-US': 'Summary' } } },
  ]) assert.throws(() => validateRelease({ ...manifest, ...change }, `v${change.version ?? manifest.version}`));
});

test('runtime requirements allow later upgrades instead of exact-version allowlists', () => {
  assert.equal(manifest.engines.node, '>=22.19.0');
  assert.ok(semver.satisfies('26.0.0', manifest.engines.node));
  assert.ok(!semver.satisfies('22.18.0', manifest.engines.node));
  assert.equal(manifest.dsh.compatibility.dsh, '>=0.1.2-alpha.4');
  assert.ok(semver.satisfies('0.1.6', manifest.dsh.compatibility.dsh));
  assert.ok(semver.satisfies('0.1.5-rc.2', manifest.dsh.compatibility.dsh, { includePrerelease: true }));
  assert.deepEqual(manifest.dsh.compatibility.profiles, ['web', 'desktop']);
});

test('registry existence check refuses overwrite and all query errors', () => {
  assertUnpublishedStatus(404);
  for (const status of [200, 202, 401, 403, 429, 500, 503]) assert.throws(() => assertUnpublishedStatus(status));
});

test('private release query requires publisher identity and confirmed absence', async () => {
  for (const [status, succeeds] of [[404, true], [200, false], [401, false], [500, false]]) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(url);
      assert.equal(new URL(url).origin, 'https://npm.tokensapi.ai');
      assert.equal(init.headers.authorization, 'Bearer synthetic-publisher-token');
      assert.equal(init.redirect, 'error');
      return url.endsWith('/-/whoami') ? Response.json({ username: 'tokenscowork' }) : new Response(null, { status });
    };
    const request = registryRelease('check', { manifest, token: 'synthetic-publisher-token', fetchImpl });
    if (succeeds) await request; else await assert.rejects(request);
    assert.equal(calls.length, 2);
  }
  await assert.rejects(registryRelease('check', { manifest, token: '', fetchImpl: () => assert.fail('No request without credentials') }));
  await assert.rejects(registryRelease('check', { manifest, token: 'synthetic-publisher-token', fetchImpl: async () => Response.json({ username: 'market' }) }));
});

test('registry verification checks the same tarball, exact identity and latest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connect-release-'));
  try {
    const bytes = Buffer.from('synthetic checked tarball');
    const filename = join(root, 'checked.tgz');
    await writeFile(filename, bytes);
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    for (const mode of ['valid', 'pending', 'wrong-integrity', 'wrong-latest', 'wrong-identity', 'latest-denied']) {
      let calls = 0;
      const fetchImpl = async url => {
        calls++;
        if (url.endsWith('/-/whoami')) return Response.json({ username: 'tokenscowork' });
        if (url.endsWith('/latest')) return mode === 'latest-denied' ? new Response(null, { status: 401 }) : Response.json({ version: mode === 'wrong-latest' ? '0.0.1' : manifest.version });
        if (mode === 'pending' && calls === 2) return new Response('Pending registry replication', { status: 202 });
        return Response.json({ name: mode === 'wrong-identity' ? '@other/plugin' : manifest.name, version: manifest.version,
          dist: { integrity: mode === 'wrong-integrity' ? 'sha512-invalid' : integrity } });
      };
      const request = registryRelease('verify', { manifest, token: 'synthetic-publisher-token', filename, fetchImpl });
      if (['valid', 'pending'].includes(mode)) await request; else await assert.rejects(request);
      assert.ok(calls <= 7, 'Verification must remain bounded');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
