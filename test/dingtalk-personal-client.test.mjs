import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  connectDingtalkPersonal,
  DINGTALK_PERSONAL_ENDPOINTS,
  DINGTALK_PERSONAL_RPC_CHANNEL,
  disconnectDingtalkPersonal,
  fetchDingtalkPersonalStatus,
} from '../plugin-src/client/connectors/dingtalk-personal/api.js';
import {
  cacheDingtalkPersonalStatus,
  clearDingtalkPersonalStatusCache,
  deriveDingtalkPersonalView,
  DingtalkPersonalSettings,
  safeDingtalkPersonalHref,
} from '../plugin-src/client/connectors/dingtalk-personal/index.js';

const AUTH_URL = 'https://login.dingtalk.com/oauth2/device/verify.htm?user_code=NFSZ-GHSD';

beforeEach(() => clearDingtalkPersonalStatusCache());

test('DingTalk personal client uses its isolated RPC contract', async () => {
  const calls = [];
  const rpcCall = async (endpoint, payload, signal) => {
    calls.push({ endpoint, payload, signal });
    return { ok: true, value: { endpoint } };
  };
  const signal = new AbortController().signal;

  assert.equal(DINGTALK_PERSONAL_RPC_CHANNEL, '/tokens-dingtalk-workspace');
  assert.equal((await fetchDingtalkPersonalStatus(rpcCall, signal)).endpoint, DINGTALK_PERSONAL_ENDPOINTS.status);
  assert.equal((await connectDingtalkPersonal(rpcCall, { force: true }, signal)).endpoint, DINGTALK_PERSONAL_ENDPOINTS.connect);
  assert.equal((await disconnectDingtalkPersonal(rpcCall, signal)).endpoint, DINGTALK_PERSONAL_ENDPOINTS.disconnect);
  assert.deepEqual(calls, [
    { endpoint: 'dingtalk/status', payload: {}, signal },
    { endpoint: 'dingtalk/connect', payload: { force: true }, signal },
    { endpoint: 'dingtalk/disconnect', payload: { confirm: true }, signal },
  ]);
});

test('DingTalk client accepts only the one-click official authorization URL', () => {
  assert.equal(safeDingtalkPersonalHref(AUTH_URL), AUTH_URL);
  assert.equal(safeDingtalkPersonalHref(AUTH_URL.replace('https:', 'http:')), undefined);
  assert.equal(safeDingtalkPersonalHref('javascript:alert(1)'), undefined);
  assert.equal(safeDingtalkPersonalHref(null), undefined);
});

test('DingTalk personal status normalizes a completed login immediately', () => {
  assert.deepEqual(deriveDingtalkPersonalView({
    phase: 'authorizing',
    authenticated: true,
    authorizeUrl: AUTH_URL,
  }), {
    phase: 'connected',
    connected: true,
    connecting: false,
    actionHref: undefined,
  });
});

test('DingTalk personal settings render the one-click authorization action', () => {
  cacheDingtalkPersonalStatus(undefined, {
    phase: 'authorizing',
    authorizeUrl: AUTH_URL,
    authenticated: false,
    installed: true,
    skills: { available: false, count: 0 },
  });
  const markup = renderToStaticMarkup(React.createElement(DingtalkPersonalSettings, {
    rpcCall: async () => ({ ok: true, value: {} }),
  }));
  assert.match(markup, /钉钉个人账号/);
  assert.match(markup, /打开钉钉授权页面/);
  assert.match(markup, /href="https:\/\/login\.dingtalk\.com\/oauth2\/device\/verify\.htm\?user_code=NFSZ-GHSD"/);
  assert.doesNotMatch(markup, /实验|deviceCode|userCode|<input/);
});
