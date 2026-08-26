import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';

import { beginRegistration } from '../plugin-src/host/connectors/feishu-personal/register.js';
import { TENANT_SCOPES } from '../plugin-src/host/connectors/feishu-personal/scopes.js';
import { REQUIRED_TENANT_SCOPES } from '../src/channels/feishu/plugin-controller.mjs';

test('personal-created applications include every permission required by the IM bot runtime', () => {
  for (const scope of REQUIRED_TENANT_SCOPES) {
    assert.equal(TENANT_SCOPES.includes(scope), true, `missing shared IM scope ${scope}`);
  }
});

test('personal-created applications can write approval instance comments as the app identity', () => {
  assert.equal(TENANT_SCOPES.includes('approval:instance.comment'), true);
});

test('personal one-click applications include IM events and card callbacks for later reuse', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    device_code: 'device-code',
    verification_uri_complete: 'https://open.feishu.cn/page/launcher',
    interval: 5,
    expires_in: 600,
  }), { status: 200 });
  try {
    const registration = await beginRegistration({
      domain: 'feishu',
      appName: 'Tokens 工作助手',
      appDesc: 'TokensHarness · 飞书连接',
      tenantScopes: ['im:message:send_as_bot'],
      userScopes: ['offline_access'],
    });
    const addons = new URL(registration.qrUrl).searchParams.get('addons');
    const payload = JSON.parse(gunzipSync(Buffer.from(addons, 'base64url')).toString('utf8'));

    assert.equal(payload.preset, false);
    assert.deepEqual(payload.scopes, {
      tenant: ['im:message:send_as_bot'],
      user: ['offline_access'],
    });
    assert.deepEqual(payload.events.items.tenant, ['im.message.receive_v1']);
    assert.deepEqual(payload.callbacks.items, ['card.action.trigger']);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
