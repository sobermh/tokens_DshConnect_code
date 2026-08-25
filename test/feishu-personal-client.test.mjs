import assert from 'node:assert/strict';
import test from 'node:test';

import {
  connectFeishuPersonal,
  FEISHU_PERSONAL_ENDPOINTS,
  FEISHU_PERSONAL_RPC_CHANNEL,
  fetchFeishuPersonalStatus,
} from '../plugin-src/client/connectors/feishu-personal/api.js';
import { safeFeishuPersonalHref } from '../plugin-src/client/connectors/feishu-personal/index.js';
import { identityFile } from '../plugin-src/host/connectors/feishu-personal/identity.js';

test('personal Feishu client keeps the established RPC contract', async () => {
  const calls = [];
  const rpcCall = async (endpoint, payload, signal) => {
    calls.push({ endpoint, payload, signal });
    return { ok: true, value: { endpoint } };
  };
  const signal = new AbortController().signal;

  assert.equal(FEISHU_PERSONAL_RPC_CHANNEL, '/tokens-feishu-connect');
  assert.deepEqual(await fetchFeishuPersonalStatus(rpcCall, signal), {
    endpoint: FEISHU_PERSONAL_ENDPOINTS.status,
  });
  assert.deepEqual(await connectFeishuPersonal(rpcCall, {
    domain: 'feishu',
    force: false,
  }, signal), { endpoint: FEISHU_PERSONAL_ENDPOINTS.connect });
  assert.deepEqual(calls, [
    { endpoint: 'feishu/status', payload: {}, signal },
    { endpoint: 'feishu/connect', payload: { domain: 'feishu', force: false }, signal },
  ]);
});

test('personal Feishu links allow only HTTPS navigation', () => {
  assert.equal(safeFeishuPersonalHref('https://open.feishu.cn/example'), 'https://open.feishu.cn/example');
  assert.equal(safeFeishuPersonalHref('http://open.feishu.cn/example'), undefined);
  assert.equal(safeFeishuPersonalHref('javascript:alert(1)'), undefined);
  assert.equal(safeFeishuPersonalHref(null), undefined);
});

test('personal Feishu identity metadata keeps the dsh-feishu profile name', () => {
  const path = identityFile('dsh-feishu', 'C:\\Users\\tester\\.dsh\\feishu-identities');
  assert.match(path, /dsh-feishu\.identity\.json$/);
});
