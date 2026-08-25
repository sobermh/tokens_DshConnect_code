import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyFeishuPersonalConnector,
  createImHostPlugin,
  inject,
  name,
} from '../plugin-src/host/index.mjs';

test('Feishu personal connector runs inside an awaited child plugin fiber', async () => {
  const events = [];
  const connector = { name: 'feishu-personal', apply() {} };
  const config = { profile: 'dsh-feishu' };
  const fiber = {
    async await() {
      events.push('fiber:await');
    },
  };
  const ctx = {
    plugin(plugin, pluginConfig) {
      events.push('ctx:plugin');
      assert.equal(plugin, connector);
      assert.equal(pluginConfig, config);
      return fiber;
    },
  };

  const result = await applyFeishuPersonalConnector(ctx, config, async () => connector);

  assert.equal(result, fiber);
  assert.deepEqual(events, ['ctx:plugin', 'fiber:await']);
});

test('Feishu personal connector keeps direct apply fallback for lightweight hosts', async () => {
  const calls = [];
  const ctx = { marker: 'test-host' };
  const config = { profile: 'dsh-feishu' };
  const connector = {
    async apply(applyCtx, applyConfig) {
      calls.push([applyCtx, applyConfig]);
      return 'applied';
    },
  };

  const result = await applyFeishuPersonalConnector(ctx, config, async () => connector);

  assert.equal(result, 'applied');
  assert.deepEqual(calls, [[ctx, config]]);
});

test('Feishu personal connector waits for child cleanup before surfacing startup failure', async () => {
  const registrations = new Set(['feishu_connect', '/tokens-feishu-connect/feishu/status']);
  const failure = new Error('connector startup failed');
  const ctx = {
    plugin() {
      return {
        async await() {
          registrations.clear();
          throw failure;
        },
      };
    },
  };

  await assert.rejects(
    () => applyFeishuPersonalConnector(ctx, {}, async () => ({ apply() {} })),
    failure,
  );
  assert.equal(registrations.size, 0);
});

test('Host composes message channels and service connectors inside one plugin context', async () => {
  const calls = [];
  const plugin = createImHostPlugin({
    applyFeishu: async (ctx, config) => calls.push(['feishu', ctx, config]),
    applyWeixin: async (ctx, config) => calls.push(['weixin', ctx, config]),
    applyDingtalk: async (ctx, config) => calls.push(['dingtalk', ctx, config]),
    applyWecom: async (ctx, config) => calls.push(['wecom', ctx, config]),
    applyQq: async (ctx, config) => calls.push(['qq', ctx, config]),
    applySlack: async (ctx, config) => calls.push(['slack', ctx, config]),
    applyTelegram: async (ctx, config) => calls.push(['telegram', ctx, config]),
    applyDiscord: async (ctx, config) => calls.push(['discord', ctx, config]),
    applyWhatsapp: async (ctx, config) => calls.push(['whatsapp', ctx, config]),
    applyOffice: async (ctx, config) => calls.push(['office', ctx, config]),
    applyFeishuPersonal: async (ctx, config) => calls.push(['feishuPersonal', ctx, config]),
  });
  const ctx = { marker: 'shared-context' };
  const config = {
    rpcAuthority: 'trusted-host',
    feishu: { domain: 'feishu' },
    weixin: { timeout: 30 },
    dingtalk: { replyTimeoutMs: 60_000 },
    wecom: { replyTimeoutMs: 60_000 },
    qq: { replyTimeoutMs: 60_000 },
    slack: { replyTimeoutMs: 60_000 },
    telegram: { replyTimeoutMs: 60_000 },
    discord: { replyTimeoutMs: 60_000 },
    whatsapp: { replyTimeoutMs: 60_000 },
    office: { heartbeatSeconds: 30 },
    feishuPersonal: { appName: 'Local assistant' },
  };

  await plugin.apply(ctx, config);

  assert.equal(name, 'dsh-connect-host');
  assert.deepEqual(inject, [
    'connection',
    'credentials',
    'tools',
    'webServer',
    'typertGateway',
  ]);
  assert.deepEqual(calls, [
    ['feishu', ctx, { ...config.feishu, rpcAuthority: 'trusted-host' }],
    ['weixin', ctx, { ...config.weixin, rpcAuthority: 'trusted-host' }],
    ['dingtalk', ctx, { ...config.dingtalk, rpcAuthority: 'trusted-host' }],
    ['wecom', ctx, { ...config.wecom, rpcAuthority: 'trusted-host' }],
    ['qq', ctx, { ...config.qq, rpcAuthority: 'trusted-host' }],
    ['slack', ctx, { ...config.slack, rpcAuthority: 'trusted-host' }],
    ['telegram', ctx, { ...config.telegram, rpcAuthority: 'trusted-host' }],
    ['discord', ctx, { ...config.discord, rpcAuthority: 'trusted-host' }],
    ['whatsapp', ctx, { ...config.whatsapp, rpcAuthority: 'trusted-host' }],
    ['office', ctx, { ...config.office, rpcAuthority: 'trusted-host' }],
    ['feishuPersonal', ctx, {
      appIdEnv: 'FEISHU_APP_ID',
      appSecretEnv: 'FEISHU_APP_SECRET',
      baseURL: 'https://open.feishu.cn',
      appName: 'Local assistant',
      appDesc: 'TokensHarness · 飞书连接',
      profile: 'dsh-feishu',
    }],
  ]);
});

const CHANNELS = [
  ['feishu', 'applyFeishu'],
  ['weixin', 'applyWeixin'],
  ['dingtalk', 'applyDingtalk'],
  ['wecom', 'applyWecom'],
  ['qq', 'applyQq'],
  ['slack', 'applySlack'],
  ['telegram', 'applyTelegram'],
  ['discord', 'applyDiscord'],
  ['whatsapp', 'applyWhatsapp'],
  ['office', 'applyOffice'],
  ['feishuPersonal', 'applyFeishuPersonal'],
];

function activationFixture(failedChannels) {
  const calls = [];
  const events = [];
  const errors = [];
  const failures = new Map();
  const internals = Object.fromEntries(CHANNELS.map(([channel, applyName]) => [
    applyName,
    async () => {
      calls.push(channel);
      events.push(`${channel}:start`);
      await new Promise((resolve) => setImmediate(resolve));
      if (failedChannels.has(channel)) {
        const error = new Error(`${channel} unavailable`);
        failures.set(channel, error);
        events.push(`${channel}:failed`);
        throw error;
      }
      events.push(`${channel}:end`);
    },
  ]));
  const ctx = { logger: { error: (...args) => errors.push(args) } };
  return { plugin: createImHostPlugin(internals), ctx, calls, events, errors, failures };
}

test('Host continues activating connectors in order when one connector fails', async () => {
  for (const [failedChannel] of CHANNELS) {
    const fixture = activationFixture(new Set([failedChannel]));

    await fixture.plugin.apply(fixture.ctx, {});

    assert.deepEqual(fixture.calls, CHANNELS.map(([channel]) => channel));
    assert.deepEqual(fixture.events, CHANNELS.flatMap(([channel]) => [
      `${channel}:start`,
      `${channel}:${channel === failedChannel ? 'failed' : 'end'}`,
    ]));
    assert.equal(fixture.errors.length, 1);
    assert.match(fixture.errors[0][0], new RegExp(`activate ${failedChannel}`));
    assert.match(fixture.errors[0][0], new RegExp(`${failedChannel} unavailable`));
    assert.equal(fixture.errors[0][1], fixture.failures.get(failedChannel));
  }
});

test('Host reports aggregate failure only after every connector was attempted', async () => {
  const fixture = activationFixture(new Set(CHANNELS.map(([channel]) => channel)));

  await assert.rejects(
    () => fixture.plugin.apply(fixture.ctx, {}),
    (error) => error instanceof AggregateError
      && error.errors.length === CHANNELS.length
      && /failed to activate every connector/.test(error.message),
  );
  assert.deepEqual(fixture.calls, CHANNELS.map(([channel]) => channel));
  assert.equal(fixture.errors.length, CHANNELS.length);
});
