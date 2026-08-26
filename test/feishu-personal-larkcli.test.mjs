import assert from 'node:assert/strict';
import test from 'node:test';

import { statusFromMap } from '../plugin-src/host/connectors/feishu-personal/larkcli.js';

test('lark-cli auth status retains the application identity used by the valid user token', () => {
  assert.deepEqual(statusFromMap({
    appId: 'cli_shared_application',
    brand: 'feishu',
    identities: {
      user: {
        available: true,
        tokenStatus: 'valid',
        userName: 'Sean',
        openId: 'ou_test',
      },
    },
  }), {
    connected: true,
    tokenStatus: 'valid',
    userName: 'Sean',
    openId: 'ou_test',
    appId: 'cli_shared_application',
    brand: 'feishu',
  });
});

test('lark-cli auth status still supports the legacy flat response shape', () => {
  assert.deepEqual(statusFromMap({
    app_id: 'cli_legacy_application',
    available: true,
    tokenStatus: 'ready',
  }), {
    connected: true,
    tokenStatus: 'ready',
    appId: 'cli_legacy_application',
  });
});

test('lark-cli auth status exposes verified identities and the actual user scopes', () => {
  assert.deepEqual(statusFromMap({
    appId: 'cli_verified_application',
    verified: true,
    identities: {
      bot: {
        available: true,
        verified: true,
        status: 'ready',
        appName: 'Tokens 工作助手',
      },
      user: {
        available: true,
        verified: true,
        tokenStatus: 'valid',
        scope: 'docx:document:create base:app:create docx:document:create',
        grantedAt: '2026-08-26T12:00:00+08:00',
        expiresAt: '2026-08-26T14:00:00+08:00',
      },
    },
  }), {
    connected: true,
    tokenStatus: 'valid',
    verified: true,
    scopes: ['base:app:create', 'docx:document:create'],
    scopeCount: 2,
    grantedAt: '2026-08-26T12:00:00+08:00',
    expiresAt: '2026-08-26T14:00:00+08:00',
    appId: 'cli_verified_application',
    bot: {
      available: true,
      status: 'ready',
      verified: true,
      appName: 'Tokens 工作助手',
    },
  });
});
