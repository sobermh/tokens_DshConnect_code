import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHANNEL_GROUPS,
  CONNECTION_DEFINITIONS,
  connectionDefinition,
  createConnectionRpcCalls,
} from '../plugin-src/client/connection-catalog.js';

test('connection catalog is the complete unique source for navigation and RPC wiring', async () => {
  const ids = CONNECTION_DEFINITIONS.map((item) => item.id);
  const rpcKeys = CONNECTION_DEFINITIONS.map((item) => item.rpcKey);
  const groupIds = CHANNEL_GROUPS.flatMap((group) => group.channels.map((item) => item.id));

  assert.equal(CONNECTION_DEFINITIONS.length, 12);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(rpcKeys).size, rpcKeys.length);
  assert.deepEqual(groupIds, ids);
  assert.equal(connectionDefinition('dingtalk-personal').groupId, 'authorizations');
  assert.equal(connectionDefinition('imessage').rpcKey, 'imessageRpcCall');

  const calls = [];
  const rpcCalls = createConnectionRpcCalls({
    rpc: {
      async call(channel, endpoint, payload, signal) {
        calls.push({ channel, endpoint, payload, signal });
        return { ok: true };
      },
    },
  });
  const signal = new AbortController().signal;
  await rpcCalls.feishuRpcCall('connection.status', { botId: 'bot-one' }, signal);
  await rpcCalls.dingtalkPersonalRpcCall('dingtalk/status', {}, signal);
  assert.deepEqual(calls, [
    {
      channel: '/api',
      endpoint: 'dsh-im/feishu',
      payload: {
        method: 'connection.status',
        payload: { botId: 'bot-one' },
      },
      signal,
    },
    {
      channel: '/tokens-dingtalk-workspace',
      endpoint: 'dingtalk/status',
      payload: {},
      signal,
    },
  ]);
});
