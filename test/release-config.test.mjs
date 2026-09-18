import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateRelease } from '../scripts/validate-release.mjs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('manual release checks out a tag and shares validation and concurrency', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /release_tag:\s+description:/);
  const releaseRef = "inputs.release_tag && format('refs/tags/{0}', inputs.release_tag) || github.ref";
  assert.ok(workflow.includes(`ref: \${{ ${releaseRef} }}`));
  assert.ok(workflow.includes(`group: ci-\${{ ${releaseRef} }}`));
  assert.ok(workflow.includes('RELEASE_TAG: ${{ inputs.release_tag || github.ref_name }}'));
  assert.equal(workflow.split("github.event_name == 'workflow_dispatch' && inputs.release_tag != ''").length - 1, 3);
  assert.equal(workflow.split("github.repository == 'sobermh/tokens_DshConnect_code'").length - 1, 2);
});

test('release identity uses the private registry and matching stable tag', () => {
  assert.equal(validateRelease(manifest, `v${manifest.version}`), manifest.version);
  for (const tag of ['main', 'v9.9.9', '', undefined]) {
    assert.throws(() => validateRelease(manifest, tag));
  }
});

test('release refuses public publishing, foreign names and prerelease latest', () => {
  for (const change of [
    { name: '@other/plugin' },
    { publishConfig: { registry: 'https://registry.npmjs.org/' } },
    { publishConfig: { ...manifest.publishConfig, access: 'public' } },
    { version: '2.9.0-beta.1' },
    { version: '02.9.0' },
  ]) assert.throws(() => validateRelease({ ...manifest, ...change }, `v${change.version ?? manifest.version}`));
});
