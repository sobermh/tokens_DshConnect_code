import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applicationScopesFromData,
  inspectApplicationScopes,
} from '../plugin-src/host/connectors/feishu-personal/application-scopes.js';
import { buildCapabilityStatus } from '../plugin-src/host/connectors/feishu-personal/capabilities.js';
import { buildPermissionReport } from '../plugin-src/host/connectors/feishu-personal/permissions.js';
import { inspectSkills } from '../plugin-src/host/connectors/feishu-personal/skills-provision.js';

test('permission status exposes only provider and local inspection results', () => {
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
  }, {
    available: true,
    source: 'application scope test',
    values: ['approval:instance.comment'],
    pendingValues: ['im:message.group_msg'],
  });

  assert.equal('capabilities' in result, false);
  assert.deepEqual(result.authorization.scopes.domains, [
    { id: 'approval', name: '审批', count: 1 },
    { id: 'base', name: '多维表格', count: 1 },
    { id: 'docx', name: '新版文档', count: 1 },
  ]);
  assert.equal(result.authorization.appIdentity.verified, true);
  assert.equal(result.authorization.personalIdentity.verified, true);
  assert.deepEqual(result.authorization.applicationScopes, {
    available: true,
    source: 'application scope test',
    count: 1,
    values: ['approval:instance.comment'],
    domains: [{ id: 'approval', name: '审批', count: 1 }],
    pendingCount: 1,
    pendingValues: ['im:message.group_msg'],
    tenant: {
      count: 1,
      granted: ['approval:instance.comment'],
      pendingCount: 1,
      pending: ['im:message.group_msg'],
      domains: [{ id: 'approval', name: '审批', count: 1 }],
    },
    user: {
      count: 0,
      granted: [],
      pendingCount: 0,
      pending: [],
      domains: [],
    },
  });
});

test('application scope status separates granted and pending tenant permissions', () => {
  assert.deepEqual(applicationScopesFromData({
    scopes: [
      { scope_name: 'approval:instance.comment', grant_status: 1, scope_type: 'tenant' },
      { scope_name: 'im:message.group_msg', grant_status: 0, scope_type: 'tenant' },
      { scope_name: 'approval:instance:read', grant_status: 1, scope_type: 'user' },
      { scope_name: 'approval:instance.comment', grant_status: 1, scope_type: 'tenant' },
      { scope_name: '', grant_status: 1, scope_type: 'tenant' },
    ],
  }), {
    available: true,
    source: 'lark-cli api GET /open-apis/application/v6/scopes --as bot',
    entries: [
      {
        name: 'approval:instance:read',
        type: 'user',
        grantStatus: 1,
        granted: true,
      },
      {
        name: 'approval:instance.comment',
        type: 'tenant',
        grantStatus: 1,
        granted: true,
      },
      {
        name: 'im:message.group_msg',
        type: 'tenant',
        grantStatus: 0,
        granted: false,
      },
    ],
    tenant: {
      granted: ['approval:instance.comment'],
      pending: ['im:message.group_msg'],
    },
    user: {
      granted: ['approval:instance:read'],
      pending: [],
    },
    values: ['approval:instance.comment'],
    pendingValues: ['im:message.group_msg'],
  });
});

test('permission report separates application identities from current personal OAuth', () => {
  const report = buildPermissionReport({
    connected: true,
    verified: true,
    scopes: ['approval:instance:read', 'docx:document:create'],
  }, applicationScopesFromData({
    scopes: [
      { scope_name: 'approval:instance.comment', grant_status: 1, scope_type: 'tenant' },
      { scope_name: 'approval:instance:read', grant_status: 1, scope_type: 'user' },
      { scope_name: 'im:message.group_msg', grant_status: 0, scope_type: 'tenant' },
    ],
  }), 'approval:instance.comment');

  assert.deepEqual(report.application.tenant, {
    count: 1,
    granted: ['approval:instance.comment'],
    pendingCount: 1,
    pending: ['im:message.group_msg'],
  });
  assert.deepEqual(report.application.user, {
    count: 1,
    granted: ['approval:instance:read'],
    pendingCount: 0,
    pending: [],
  });
  assert.deepEqual(report.personal.granted, ['approval:instance:read', 'docx:document:create']);
  assert.deepEqual(report.match, {
    scope: 'approval:instance.comment',
    applicationTenant: 'granted',
    applicationUser: 'missing',
    personal: 'missing',
  });
});

test('application scopes are queried with the bot identity', async () => {
  const calls = [];
  const result = await inspectApplicationScopes({
    async api(method, path, options, signal) {
      calls.push({ method, path, options, signal });
      return {
        scopes: [
          { scope_name: 'approval:instance.comment', grant_status: 1, scope_type: 'tenant' },
        ],
      };
    },
  });

  assert.deepEqual(calls, [{
    method: 'GET',
    path: '/open-apis/application/v6/scopes',
    options: { as: 'bot' },
    signal: undefined,
  }]);
  assert.deepEqual(result.values, ['approval:instance.comment']);
});

test('application scope status rejects an incomplete provider response', () => {
  assert.throws(() => applicationScopesFromData({}), /returned no scope list/);
});

test('unavailable application scope inspection remains explicit', () => {
  const result = buildCapabilityStatus({
    connected: true,
    scopes: ['approval:instance:read'],
  }, {}, { available: false });

  assert.deepEqual(result.authorization.applicationScopes, {
    available: false,
    source: 'GET /open-apis/application/v6/scopes',
    count: 0,
    values: [],
    domains: [],
    pendingCount: 0,
    pendingValues: [],
    tenant: {
      count: 0,
      granted: [],
      pendingCount: 0,
      pending: [],
      domains: [],
    },
    user: {
      count: 0,
      granted: [],
      pendingCount: 0,
      pending: [],
      domains: [],
    },
  });
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
