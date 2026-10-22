import assert from 'node:assert/strict';
import test from 'node:test';

import { modernHarnessApi } from '../plugin-src/host/modern-harness-api.mjs';
import { HarnessClient as DingtalkHarnessClient } from '../src/channels/dingtalk/harness-client.mjs';
import { DiscordHarnessClient } from '../src/channels/discord/harness-client.mjs';
import { HarnessClient as FeishuHarnessClient } from '../src/channels/feishu/harness-client.mjs';
import { IMessageHarnessClient } from '../src/channels/imessage/harness-client.mjs';
import { QqHarnessClient } from '../src/channels/qq/harness-client.mjs';
import { SlackHarnessClient } from '../src/channels/slack/harness-client.mjs';
import { TelegramHarnessClient } from '../src/channels/telegram/harness-client.mjs';
import { WecomAppHarnessClient } from '../src/channels/wecom-app/harness-client.mjs';
import { WecomHarnessClient } from '../src/channels/wecom/harness-client.mjs';
import { HarnessClient as WeixinHarnessClient } from '../src/channels/weixin/harness-client.mjs';
import { WhatsappHarnessClient } from '../src/channels/whatsapp/harness-client.mjs';
import { SKIP_WITHOUT_HOST, hostVersion, realHostGateway } from './support/real-host-gateway.mjs';

// HOST-CHANNEL: one "inbound message -> channel client -> bridge -> host ->
// reply" round trip per channel, against the installed host's real Typert
// gateway and its real generated descriptors.
//
// Every channel reaches the host through its own `HarnessClient` subclass over
// the same bridge, so this is the path that broke for all of them at once on
// dsh 0.2.1: the prompt carries the channel's own rpc-id prefix, the host
// correlates the turn by that id, and the channel reads the answer back out of
// the durable `assistant/message`. The IM transports themselves are not
// exercised here -- there is no IM network in a test run, and the existing
// per-channel suites cover that half with fakes.
//
// Run against a real install (one leg per staged host):
//   DSH_HOST_ROOT=<...>/dsh-plugin-desktop npm run check:host
// Without DSH_HOST_ROOT these cases are reported as not executed, never passed.
const skip = SKIP_WITHOUT_HOST;

const SESSION_ID = 'session';
const WORKSPACE_ID = 'workspace';
const WORKSPACE_PATH = 'C:/workspace';
const INBOUND = '您好';
const REPLY = '您好，我在。请问需要查询什么？';

const CHANNELS = [
  ['HOST-CHANNEL-01 weixin', WeixinHarnessClient, 'weixin'],
  ['HOST-CHANNEL-02 wecom', WecomHarnessClient, 'wecom'],
  ['HOST-CHANNEL-03 wecom-app', WecomAppHarnessClient, 'wecomapp'],
  ['HOST-CHANNEL-04 dingtalk', DingtalkHarnessClient, 'dingtalk'],
  ['HOST-CHANNEL-05 feishu', FeishuHarnessClient, 'feishu'],
  ['HOST-CHANNEL-06 telegram', TelegramHarnessClient, 'telegram'],
  ['HOST-CHANNEL-07 qq', QqHarnessClient, 'qq'],
  ['HOST-CHANNEL-08 slack', SlackHarnessClient, 'slack'],
  ['HOST-CHANNEL-09 discord', DiscordHarnessClient, 'discord'],
  ['HOST-CHANNEL-10 whatsapp', WhatsappHarnessClient, 'whatsapp'],
  ['HOST-CHANNEL-11 imessage', IMessageHarnessClient, 'imessage'],
];

/**
 * A scripted Session that answers one prompt the way a live turn does: the
 * durable events appear only after the prompt is accepted, correlated by the
 * `requestId` the channel's client generated.
 *
 * @returns the scripted controllers plus the prompts they observed.
 */
function liveSessionControllers() {
  const prompts = [];
  const records = [
    { type: 'event', event: { type: 'session/start', seq: 0, time: 0, data: {} } },
  ];
  let seq = 0;
  let turn = 0;
  const append = (type, data) => {
    seq += 1;
    records.push({ type: 'event', event: { type, seq, time: seq, data } });
  };
  const sessionController = {
    list() {
      return { items: [{
        sessionId: SESSION_ID,
        agentAvailable: true,
        updatedAt: seq,
        running: false,
        blank: false,
        cwd: WORKSPACE_PATH,
      }] };
    },
    create() {
      return { sessionId: SESSION_ID };
    },
    async *follow() {
      yield {
        type: 'snapshot',
        header: { version: 4, id: SESSION_ID, createdAt: 0, isSeeded: false, cwd: WORKSPACE_PATH },
        cursor: seq,
        records: [...records],
        hasMore: false,
        projections: { asOfSeq: seq, values: {} },
      };
    },
    page() {
      return { records: [...records], hasMore: false };
    },
    prompt(request) {
      prompts.push(request);
      turn += 1;
      append('turn/start', { turn });
      append('user/message', {
        turn,
        source: { kind: 'user', rpcId: request.requestId },
        message: { content: request.content },
      });
      append('assistant/message', {
        turn,
        step: 0,
        message: { content: [{ type: 'text', text: REPLY }] },
        stream: [],
      });
      append('turn/end', { turn, reason: 'completed' });
      return { accepted: true };
    },
    cancel() {
      return { accepted: true };
    },
    rename(request) {
      return { title: request.title, seq };
    },
    modelCatalog() {
      return {
        default: { provider: 'deepseek', model: 'chat' },
        routableProviders: ['deepseek'],
        groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat', name: 'Chat' }] }],
        failures: [],
      };
    },
    selectModel(request) {
      return { selected: { provider: request.provider, model: request.model } };
    },
  };
  const workspaceController = {
    async *follow() {
      yield {
        type: 'baseline',
        value: {
          items: [{
            workspaceId: WORKSPACE_ID,
            path: WORKSPACE_PATH,
            title: 'workspace',
            sessionIds: [SESSION_ID],
            createdAt: '2026-10-22T00:00:00.000Z',
            updatedAt: '2026-10-22T00:00:00.000Z',
          }],
          archivedSessionIds: [],
          pinnedSessionIds: [],
        },
      };
    },
    create(request) {
      return {
        workspace: {
          workspaceId: WORKSPACE_ID,
          path: request.path,
          title: 'workspace',
          sessionIds: [],
          createdAt: '2026-10-22T00:00:00.000Z',
          updatedAt: '2026-10-22T00:00:00.000Z',
        },
        created: true,
      };
    },
  };
  return { prompts, receivers: { sessionController, workspaceController } };
}

for (const [name, Client, prefix] of CHANNELS) {
  test(`${name} answers an inbound message through the real host`, { skip }, async () => {
    const { prompts, receivers } = liveSessionControllers();
    const fixture = await realHostGateway({ receivers });
    const apiProxy = modernHarnessApi(fixture.app);
    const client = new Client({
      apiProxy,
      interactionScope: fixture.app.root ?? fixture.app,
      workspace: WORKSPACE_PATH,
      fetchImpl: () => assert.fail('an in-process channel must not reach the host over HTTP'),
      createWebSocket: () => assert.fail('an in-process channel must not open a WebSocket'),
    });

    assert.equal(await client.health(), true, 'the bridge must report itself ready');
    const sessionId = await client.createSession();
    assert.equal(sessionId, SESSION_ID);
    const answer = await client.ask(sessionId, INBOUND, { timeoutMs: 30_000 });
    assert.equal(
      answer,
      REPLY,
      `${prefix} did not read the host's durable answer back (dsh ${
        hostVersion('@deepseek-ai/dsh-api-session-controller')})`,
    );
    assert.equal(prompts.length, 1, 'exactly one prompt must reach the host');
    assert.equal(prompts[0].sessionId, SESSION_ID);
    assert.deepEqual(prompts[0].content, [{ type: 'text', text: INBOUND }]);
    // The host correlates the turn by this id, and the channel's own prefix is
    // what makes two channels on one Session unable to answer each other.
    assert.ok(
      prompts[0].requestId.startsWith(`${prefix}-`),
      `expected a ${prefix} rpc id, got ${prompts[0].requestId}`,
    );
  });
}
