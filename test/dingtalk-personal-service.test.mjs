import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DINGTALK_PERSONAL_ENDPOINTS,
} from '../plugin-src/shared/connectors/dingtalk-personal-contract.js';
import {
  createDingtalkRpcHandler,
} from '../plugin-src/host/connectors/dingtalk-personal/rpc.js';
import {
  createDingtalkPersonalService,
} from '../plugin-src/host/connectors/dingtalk-personal/service.js';

const AUTH_URL = 'https://login.dingtalk.com/oauth2/auth?client_id=ding_test_client&redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2Fcallback&response_type=code&scope=openid+corpid&prompt=consent';

function liveStatus(overrides = {}) {
  return {
    installed: true,
    version: '1.0.61',
    authenticated: false,
    tokenValid: false,
    refreshTokenValid: false,
    userName: null,
    corpName: null,
    expiresAt: null,
    refreshExpiresAt: null,
    message: null,
    profile: null,
    ...overrides,
  };
}

test('DingTalk personal service owns connection state and keeps the DWS profile private', async () => {
  let current = liveStatus();
  const calls = [];
  const dws = {
    async status() { calls.push('status'); return current; },
    async provision() { calls.push('provision'); },
    async login(_signal, onAuthorizeUrl) {
      calls.push('login');
      onAuthorizeUrl(AUTH_URL);
      current = liveStatus({
        authenticated: true,
        tokenValid: true,
        refreshTokenValid: true,
        userName: 'Sean',
        corpName: 'Tokens',
        profile: 'corp:user',
      });
      return current;
    },
    async logout(_signal, profile) {
      calls.push(['logout', profile]);
      current = liveStatus();
    },
    async execute(args, options) { return { args, options }; },
  };
  const service = createDingtalkPersonalService({
    dws,
    ensureSkills: async (force) => {
      calls.push(['skills', force ?? false]);
      return { count: 2, version: '1.0.61' };
    },
    inspectSkills: async () => ({
      available: true,
      version: '1.0.61',
      count: 2,
      names: ['dingtalk-todo', 'dingtalk-calendar'],
      collisions: [],
    }),
  });

  assert.equal(service.startConnect(false), true);
  await service.waitForAuthorizationStart(1_000);
  const connected = await service.status();
  assert.equal(connected.phase, 'connected');
  assert.equal(connected.authenticated, true);
  assert.equal(connected.userName, 'Sean');
  assert.equal('profile' in connected, false);
  assert.deepEqual(connected.capabilities.map((item) => item.id), [
    'dingtalk-todo',
    'dingtalk-calendar',
  ]);

  assert.deepEqual(await service.execute(['todo', 'list'], { confirmed: false }), {
    args: ['todo', 'list'],
    options: { confirmed: false },
  });
  assert.deepEqual(await service.refreshSkills(), { count: 2, version: '1.0.61' });
  const disconnected = await service.disconnect();
  assert.equal(disconnected.phase, 'idle');
  assert.equal(disconnected.authenticated, false);
  assert.ok(calls.some((entry) => Array.isArray(entry)
    && entry[0] === 'logout' && entry[1] === 'corp:user'));
  service.dispose();
});

test('DingTalk personal service keeps one authorization flow for concurrent connect calls', async () => {
  let finishLogin;
  let loginCalls = 0;
  const dws = {
    async status() { return liveStatus(); },
    async provision() {},
    async login(_signal, onAuthorizeUrl) {
      loginCalls += 1;
      onAuthorizeUrl(AUTH_URL);
      return new Promise((resolve) => { finishLogin = resolve; });
    },
  };
  const service = createDingtalkPersonalService({
    dws,
    ensureSkills: async () => ({ count: 0, version: '1.0.61' }),
    inspectSkills: async () => ({ available: true, count: 0, names: [], collisions: [] }),
  });

  assert.equal(service.startConnect(false), true);
  await service.waitForAuthorizationStart(1_000);
  assert.equal(service.startConnect(false), false);
  assert.equal(loginCalls, 1);

  const progressed = service.waitForProgress(1_000);
  finishLogin(liveStatus({ authenticated: true, tokenValid: true, userName: 'Sean' }));
  await progressed;
  assert.equal((await service.status()).phase, 'connected');
  assert.equal(loginCalls, 1);
  service.dispose();
});

test('DingTalk personal RPC validates transport payloads before calling the service', async () => {
  const calls = [];
  const status = { phase: 'idle' };
  const service = {
    async status() { calls.push('status'); return status; },
    startConnect(force) { calls.push(['connect', force]); },
    async disconnect() { calls.push('disconnect'); return status; },
  };
  const handle = createDingtalkRpcHandler(service);

  assert.deepEqual(await handle(DINGTALK_PERSONAL_ENDPOINTS.status, {}), {
    ok: true,
    value: status,
  });
  assert.equal((await handle(DINGTALK_PERSONAL_ENDPOINTS.connect, { force: 'yes' })).ok, false);
  assert.deepEqual(await handle(DINGTALK_PERSONAL_ENDPOINTS.connect, { force: true }), {
    ok: true,
    value: status,
  });
  assert.equal((await handle(DINGTALK_PERSONAL_ENDPOINTS.disconnect, {})).ok, false);
  assert.deepEqual(await handle(DINGTALK_PERSONAL_ENDPOINTS.disconnect, { confirm: true }), {
    ok: true,
    value: status,
  });
  assert.equal((await handle('dingtalk/unknown', {})).error.code, 'internal');
  assert.deepEqual(calls, [
    'status',
    ['connect', true],
    'status',
    'disconnect',
  ]);
});
