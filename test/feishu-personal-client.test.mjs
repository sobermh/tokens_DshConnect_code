import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  connectFeishuPersonal,
  disconnectFeishuPersonal,
  FEISHU_PERSONAL_ENDPOINTS,
  FEISHU_PERSONAL_RPC_CHANNEL,
  fetchFeishuPersonalStatus,
} from '../plugin-src/client/connectors/feishu-personal/api.js';
import {
  cachedFeishuPersonalStatus,
  cacheFeishuPersonalStatus,
  CapabilityPanel,
  deriveFeishuPersonalView,
  FeishuPersonalSettings,
  preloadFeishuPersonalStatus,
  safeFeishuPersonalHref,
  statusMessage,
} from '../plugin-src/client/connectors/feishu-personal/index.js';
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
    applicationId: 'app_shared',
  }, signal), { endpoint: FEISHU_PERSONAL_ENDPOINTS.connect });
  assert.deepEqual(await disconnectFeishuPersonal(rpcCall, signal), {
    endpoint: FEISHU_PERSONAL_ENDPOINTS.disconnect,
  });
  assert.deepEqual(calls, [
    { endpoint: 'feishu/status', payload: {}, signal },
    {
      endpoint: 'feishu/connect',
      payload: { domain: 'feishu', force: false, applicationId: 'app_shared' },
      signal,
    },
    { endpoint: 'feishu/disconnect', payload: { confirm: true }, signal },
  ]);
});

test('personal Feishu links allow only HTTPS navigation', () => {
  assert.equal(safeFeishuPersonalHref('https://open.feishu.cn/example'), 'https://open.feishu.cn/example');
  assert.equal(safeFeishuPersonalHref('http://open.feishu.cn/example'), undefined);
  assert.equal(safeFeishuPersonalHref('javascript:alert(1)'), undefined);
  assert.equal(safeFeishuPersonalHref(null), undefined);
});

test('valid personal authorization overrides a stale authorizing reminder', () => {
  const status = {
    phase: 'authorizing',
    userAuthorized: true,
    userName: '测试账号',
    authorizeUrl: 'https://open.feishu.cn/device',
    message: 'Open this link and confirm to grant your personal Feishu identity.',
  };

  assert.deepEqual(deriveFeishuPersonalView(status), {
    phase: 'connected',
    connected: true,
    connecting: false,
    actionHref: undefined,
  });
  assert.equal(statusMessage(status), '已授权账号：测试账号');
});

test('personal Feishu status is prefetched and rendered immediately from the client cache', async () => {
  let calls = 0;
  const status = {
    phase: 'connected',
    userAuthorized: true,
    userName: 'Sean',
    appName: 'Tokens 工作助手',
    applications: [],
  };
  const rpcCall = async () => {
    calls += 1;
    return { ok: true, value: status };
  };

  assert.equal(cachedFeishuPersonalStatus(rpcCall), undefined);
  assert.equal(await preloadFeishuPersonalStatus(rpcCall), status);
  assert.equal(calls, 1);
  assert.equal(await preloadFeishuPersonalStatus(rpcCall), status);
  assert.equal(calls, 1);

  const markup = renderToStaticMarkup(React.createElement(FeishuPersonalSettings, { rpcCall }));
  assert.match(markup, /已连接/);
  assert.match(markup, /已授权账号：Sean/);

  cacheFeishuPersonalStatus(rpcCall, { ...status, userName: 'Updated' });
  assert.equal(cachedFeishuPersonalStatus(rpcCall).userName, 'Updated');
});

test('personal Feishu empty state is presented as loading instead of disconnected', () => {
  assert.deepEqual(deriveFeishuPersonalView(undefined), {
    phase: 'loading',
    connected: false,
    connecting: false,
    actionHref: undefined,
  });
});

test('personal Feishu settings hide the internal lark-cli profile', () => {
  const markup = renderToStaticMarkup(React.createElement(FeishuPersonalSettings, {
    rpcCall: async () => ({ ok: true, value: {} }),
  }));

  assert.match(markup, /飞书个人账号/);
  assert.match(markup, /本机连接/);
  assert.doesNotMatch(markup, /dsh-feishu|本机配置/);
});

test('personal Feishu identity metadata keeps the dsh-feishu profile name', () => {
  const path = identityFile('dsh-feishu', 'C:\\Users\\tester\\.dsh\\feishu-identities');
  assert.match(path, /dsh-feishu\.identity\.json$/);
});

test('capability panel renders real evidence sources and missing scopes', () => {
  const markup = renderToStaticMarkup(React.createElement(CapabilityPanel, {
    status: {
      checkedAt: '2026-08-26T04:30:00.000Z',
      capabilities: [
        {
          id: 'create-doc',
          name: '创建飞书文档',
          provider: 'feishu_create_doc',
          state: 'available',
          detail: '已授权 docx:document:create',
          source: 'lark-cli auth status --json --verify',
        },
        {
          id: 'send-message',
          name: '发送飞书消息',
          provider: 'feishu_send_message',
          state: 'missing_scope',
          detail: '缺少 im:message.send_as_user',
          source: 'lark-cli auth status --json --verify',
        },
      ],
      authorization: {
        source: 'lark-cli auth status --json --verify',
        appIdentity: { available: true, verified: true },
        personalIdentity: { available: true, verified: true, tokenStatus: 'valid' },
        scopes: {
          count: 2,
          values: ['docx:document:create', 'base:app:create'],
          domains: [
            { id: 'docx', name: '新版文档', count: 1 },
            { id: 'base', name: '多维表格', count: 1 },
          ],
        },
        skills: {
          available: true,
          count: 28,
          version: 'v1.0.90',
          source: '~/.dsh/skills/.lark-skills.json',
        },
      },
    },
  }));

  assert.match(markup, /实际能力/);
  assert.match(markup, /缺少权限/);
  assert.match(markup, /lark-cli auth status --json --verify/);
  assert.match(markup, /28 个已安装/);
  assert.match(markup, /查看 2 项实际个人权限/);
  assert.doesNotMatch(markup, /首次创建应用时会预填/);
});
