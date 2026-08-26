import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildCapabilityStatus } from '../plugin-src/host/connectors/feishu-personal/capabilities.js';
import { inspectSkills } from '../plugin-src/host/connectors/feishu-personal/skills-provision.js';

test('capability status is derived from actual user scopes instead of connection state alone', () => {
  const result = buildCapabilityStatus({
    connected: true,
    verified: true,
    tokenStatus: 'valid',
    scopes: ['base:app:create', 'docx:document:create', 'approval:instance:read'],
    bot: { available: true, verified: true, status: 'ready' },
  }, {
    available: true,
    count: 2,
    version: 'v1.0.90',
    names: ['lark-doc', 'lark-base'],
  });

  assert.equal(result.capabilities.find((item) => item.id === 'create-doc').state, 'available');
  assert.equal(result.capabilities.find((item) => item.id === 'create-bitable').state, 'available');
  assert.equal(result.capabilities.find((item) => item.id === 'send-message').state, 'missing_scope');
  assert.equal(result.capabilities.find((item) => item.id === 'official-skills').detail, '2 个已安装 · v1.0.90');
  assert.deepEqual(result.authorization.scopes.domains, [
    { id: 'approval', name: '审批', count: 1 },
    { id: 'base', name: '多维表格', count: 1 },
    { id: 'docx', name: '新版文档', count: 1 },
  ]);
  assert.equal(result.authorization.appIdentity.verified, true);
  assert.equal(result.authorization.personalIdentity.verified, true);
});

test('materialized Skills inspection reads the real local manifest and sentinel', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connect-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'lark-shared'), { recursive: true });
  await writeFile(join(root, 'lark-shared', 'SKILL.md'), '# shared\n');
  await writeFile(join(root, '.lark-skills.json'), JSON.stringify({
    larkVersion: 'v1.0.90',
    skills: ['lark-shared', 'lark-doc'],
    materializedAt: '2026-08-26T04:19:41.048Z',
  }));

  assert.deepEqual(await inspectSkills(root), {
    available: true,
    version: 'v1.0.90',
    count: 2,
    names: ['lark-shared', 'lark-doc'],
    materializedAt: '2026-08-26T04:19:41.048Z',
  });
});
