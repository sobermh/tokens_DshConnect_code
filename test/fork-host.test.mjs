import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDingtalkPersonalConnector,
  applyFeishuPersonalConnector,
  createImHostPlugin,
  inject,
  name,
} from '../plugin-src/host/index.mjs';
import { DINGTALK_INTENT_ROUTING_PROMPT } from '../plugin-src/host/connectors/dingtalk-personal/intent-routing.js';

test('an unqualified DingTalk connection request defaults to personal authorization', () => {
  assert.match(DINGTALK_INTENT_ROUTING_PROMPT, /帮我连接钉钉/);
  assert.match(DINGTALK_INTENT_ROUTING_PROMPT, /Call dingtalk_connect directly/);
  assert.match(DINGTALK_INTENT_ROUTING_PROMPT, /do not ask.*choose between a personal account and a bot/);
  assert.match(DINGTALK_INTENT_ROUTING_PROMPT, /only when.*explicitly mentions a bot/i);
});

test('DingTalk personal connector runs inside an awaited child plugin fiber', async () => {
  const events = [];
  const connector = { name: 'dingtalk-personal', apply() {} };
  const config = {};
  const fiber = { async await() { events.push('fiber:await'); } };
  const ctx = {
    plugin(plugin, pluginConfig) {
      events.push('ctx:plugin');
      assert.equal(plugin, connector);
      assert.equal(pluginConfig, config);
      return fiber;
    },
  };

  assert.equal(await applyDingtalkPersonalConnector(ctx, config, async () => connector), fiber);
  assert.deepEqual(events, ['ctx:plugin', 'fiber:await']);
});

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

test('Host passes one shared Feishu application service to IM and personal authorization', async () => {
  const service = { marker: 'shared-feishu-applications' };
  const calls = [];
  const noOp = async () => {};
  const plugin = createImHostPlugin({
    createFeishuApplicationService: async (ctx) => {
      assert.equal(ctx.credentials.marker, 'credentials');
      return service;
    },
    applyFeishu: async (_ctx, config) => calls.push(['im', config.applicationService]),
    applyFeishuPersonal: async (_ctx, config) => calls.push(['personal', config.applicationService]),
    applyDingtalkPersonal: noOp,
    applyWeixin: noOp,
    applyDingtalk: noOp,
    applyWecom: noOp,
    applyWecomApp: noOp,
    applyOffice: noOp,
    applyQq: noOp,
    applySlack: noOp,
    applyTelegram: noOp,
    applyDiscord: noOp,
    applyWhatsapp: noOp,
    applyIMessage: noOp,
  });

  await plugin.apply({ credentials: { marker: 'credentials' } }, {});

  assert.deepEqual(calls, [['im', service], ['personal', service]]);
});

test('connection center activates every upstream channel and isolates shared application failure', async () => {
  const names = ['Feishu', 'Weixin', 'Dingtalk', 'Wecom', 'WecomApp', 'Qq', 'Slack',
    'Telegram', 'Discord', 'Whatsapp', 'IMessage', 'Office', 'FeishuPersonal', 'DingtalkPersonal'];
  for (const failApplication of [false, true]) {
    const calls = new Map();
    const errors = [];
    let serviceCreations = 0;
    const service = {};
    const plugin = createImHostPlugin({
      ...Object.fromEntries(names.map((channel) => [`apply${channel}`, async (_ctx, config) => calls.set(channel, config)])),
      createFeishuApplicationService: async () => {
        serviceCreations++;
        if (failApplication) throw new Error('application unavailable');
        return service;
      },
    });
    await plugin.apply({ credentials: {}, logger: { error: (...args) => errors.push(args) } }, {
      rpcAuthority: 'trusted-host',
      dingtalkPersonal: { channel: 'stable' },
    });
    assert.equal(serviceCreations, 1);
    assert.equal(errors.length, failApplication ? 2 : 0);
    assert.deepEqual([...calls.keys()].sort(), names.filter((name) => !failApplication
      || !['Feishu', 'FeishuPersonal'].includes(name)).sort());
    assert.equal(typeof calls.get('Telegram').deliveryService.send, 'function');
    assert.equal(calls.get('Telegram').rpcAuthority, 'trusted-host');
    assert.deepEqual(calls.get('DingtalkPersonal'), { channel: 'stable' });
    if (!failApplication) {
      assert.equal(calls.get('Feishu').applicationService, service);
      assert.equal(calls.get('FeishuPersonal').applicationService, service);
    }
  }
});
