import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  createAuthorizationUrlParser,
  runDwsProcess,
  sanitizeDwsText,
  statusFromMap,
  trustedDingtalkAuthorizationUrl,
  validateDwsToolArgs,
} from '../plugin-src/host/connectors/dingtalk-personal/dws.js';

const AUTH_URL = 'https://login.dingtalk.com/oauth2/device/verify.htm?user_code=NFSZ-GHSD';

test('DWS status exposes account health without credential values', () => {
  assert.deepEqual(statusFromMap({
    authenticated: true,
    token_valid: true,
    refresh_token_valid: true,
    corp_id: 'ding_corp',
    corp_name: '测试组织',
    user_id: 'user_1',
    user_name: 'Sean',
    expires_at: '2026-09-08T00:00:00Z',
  }, 'v1.0.61'), {
    installed: true,
    version: '1.0.61',
    authenticated: true,
    tokenValid: true,
    refreshTokenValid: true,
    userName: 'Sean',
    corpName: '测试组织',
    expiresAt: '2026-09-08T00:00:00Z',
    refreshExpiresAt: null,
    message: null,
    profile: 'ding_corp:user_1',
  });
});

test('only the official complete DingTalk device authorization URL is accepted', () => {
  assert.equal(trustedDingtalkAuthorizationUrl(`open ${AUTH_URL}\n`), AUTH_URL);
  assert.equal(trustedDingtalkAuthorizationUrl(AUTH_URL.replace('https:', 'http:')), undefined);
  assert.equal(trustedDingtalkAuthorizationUrl(AUTH_URL.replace('login.dingtalk.com', 'login.dingtalk.com.evil.test')), undefined);
  assert.equal(trustedDingtalkAuthorizationUrl(AUTH_URL.replace('/oauth2/device/verify.htm', '/oauth2/authorize')), undefined);
  assert.equal(trustedDingtalkAuthorizationUrl(`${AUTH_URL}&redirect=https://evil.test`), undefined);
  assert.equal(trustedDingtalkAuthorizationUrl('https://login.dingtalk.com/oauth2/device/verify.htm?user_code=bad'), undefined);
});

test('authorization URL parser handles a URL split across stdout chunks', () => {
  const emitted = [];
  const parser = createAuthorizationUrlParser((url) => emitted.push(url));
  assert.equal(parser.push('https://login.dingtalk.com/oauth2/device/ver'), undefined);
  assert.equal(parser.push('ify.htm?user_code=NFSZ-'), undefined);
  assert.equal(parser.push('GH'), undefined, 'a chunk boundary cannot truncate a valid-looking code');
  assert.equal(parser.push('SD\n'), AUTH_URL);
  assert.equal(parser.push(AUTH_URL), AUTH_URL);
  assert.deepEqual(emitted, [AUTH_URL]);
});

test('DWS tool accepts business argv and owns the confirmation bypass', () => {
  assert.deepEqual(validateDwsToolArgs(['todo', 'list', '--format', 'json']), [
    'todo', 'list', '--format', 'json',
  ]);
  assert.deepEqual(validateDwsToolArgs(['chat', 'message', 'send'], true), [
    'chat', 'message', 'send', '--yes',
  ]);
  assert.throws(() => validateDwsToolArgs(['auth', 'status']), /not available/);
  assert.throws(() => validateDwsToolArgs(['profile', 'switch', 'corp:user']), /only allows/);
  assert.throws(() => validateDwsToolArgs(['api', 'GET', '/v1', '--client-secret=secret']), /not allowed/);
  assert.throws(() => validateDwsToolArgs(['todo', 'create', '--yes']), /confirmed=true/);
});

test('DWS output redaction removes credential and standalone device-code values', () => {
  const redacted = sanitizeDwsText(
    '{"accessToken":"access-secret","refresh_token":"refresh-secret","deviceCode":"device-secret"}\n'
      + 'Authorization: Bearer bearer-secret\n授权码: NFSZ-GHSD',
  );
  assert.doesNotMatch(redacted, /access-secret|refresh-secret|device-secret|bearer-secret|NFSZ-GHSD/);
  assert.match(redacted, /\[REDACTED\]/);
});

function hangingChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

test('DWS child process is cancelled with the caller signal', async () => {
  const child = hangingChild();
  const controller = new AbortController();
  const pending = runDwsProcess('dws', ['todo', 'list'], {
    signal: controller.signal,
    spawnImpl: () => child,
  });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal(child.killed, true);
});

test('DWS child process is killed on timeout', async () => {
  const child = hangingChild();
  await assert.rejects(
    runDwsProcess('dws', ['todo', 'list'], {
      timeoutMs: 10,
      spawnImpl: () => child,
    }),
    /timed out/,
  );
  assert.equal(child.killed, true);
});
