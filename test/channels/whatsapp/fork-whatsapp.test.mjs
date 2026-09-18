import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  mkdtemp,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DisconnectReason } from '@whiskeysockets/baileys';

import {
  OUTBOUND_ARTIFACT_TOOL,
  OutboundArtifactRegistry,
  createOutboundArtifactTool,
} from '../../../src/channels/shared/semantic/artifact.mjs';
import {
  WHATSAPP_ACCESS_MODES,
  WhatsappConfigStore,
  deriveWhatsappBotId,
  normalizeWhatsappAccessPolicy,
} from '../../../src/channels/whatsapp/config-store.mjs';
import { WhatsappController } from '../../../src/channels/whatsapp/whatsapp-controller.mjs';
import { WhatsappHarnessBridge } from '../../../src/channels/whatsapp/whatsapp-bridge.mjs';
import {
  WhatsappBotClient,
  WhatsappRuntime,
  createWhatsappMediaDownloader,
  normalizeWhatsappMessage,
  whatsappInboundAllowed,
} from '../../../src/channels/whatsapp/whatsapp-runtime.mjs';
import { createWhatsappWebSession } from '../../../src/channels/whatsapp/whatsapp-web-session.mjs';
import {
  WHATSAPP_ENDPOINTS,
  createWhatsappRpcHandler,
} from '../../../plugin-src/host/channels/whatsapp/rpc.mjs';

const ACCOUNT_JID = '16505550123@s.whatsapp.net';
const AUTH_DIRECTORY = '7fe8c17e-4fb7-4c5b-a9dc-c36525575dd1';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function within(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function committedArtifact(t, {
  suffix,
  modernSession = false,
  fileName = 'result.txt',
  content = 'WhatsApp result file',
} = {}) {
  const workspace = await mkdtemp(join(tmpdir(), `dsh-im-whatsapp-artifact-${suffix}-`));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const sessionId = `session-whatsapp-artifact-${suffix}`;
  const rpcId = `rpc-whatsapp-artifact-${suffix}`;
  let nextId = 0;
  const ids = [];
  const registry = new OutboundArtifactRegistry({
    uuid: () => {
      const id = `${suffix}-${++nextId}`;
      ids.push(id);
      return id;
    },
  });
  t.after(() => registry.clear());
  const agent = {
    session: {
      header: { id: sessionId, cwd: workspace },
      events: [
        { type: 'turn/start', data: { turn: 1 } },
        { type: 'user/message', data: { turn: 1, source: { rpcId } } },
      ],
    },
  };
  if (modernSession) {
    const events = agent.session.events;
    agent.session = { header: agent.session.header, snapshotEvents: () => [...events] };
  }
  await writeFile(join(workspace, fileName), content);
  const tool = createOutboundArtifactTool({ registry });
  const exec = {
    name: OUTBOUND_ARTIFACT_TOOL,
    callId: `call-${suffix}`,
    rootCallId: `call-${suffix}`,
    token: Symbol(`call-${suffix}`),
    agent,
  };
  await tool.definition.execute({ path: fileName }, exec);
  tool.onResult(exec, { isError: false });
  return {
    artifact: registry.take(sessionId, 1)[0],
    deliveryKey: ids[1],
  };
}

function artifactState(sessionId = 'session-whatsapp-artifact') {
  const seen = new Set();
  return {
    hasSeen: (messageId) => seen.has(messageId),
    markSeen: async (messageId) => { seen.add(messageId); },
    sessionFor: () => sessionId,
    sessionExists: async () => true,
    setSession: async () => {},
    clearSession: async () => {},
  };
}

function linkedConfig(overrides = {}) {
  return {
    botId: deriveWhatsappBotId(ACCOUNT_JID),
    accountJid: ACCOUNT_JID,
    authDirectory: AUTH_DIRECTORY,
    name: 'Harness WhatsApp',
    accessMode: WHATSAPP_ACCESS_MODES.open,
    allowedNumbers: [],
    createdAt: new Date().toISOString(),
    connectedAt: new Date().toISOString(),
    ...overrides,
  };
}

for (const modernSession of [false, true]) test(`WhatsApp runtime sends result files with native metadata, quote, stable id, and upload timeout (snapshotEvents: ${modernSession})`, async (t) => {
  const { artifact, deliveryKey } = await committedArtifact(t, {
    suffix: 'native-file',
    modernSession,
    fileName: 'report.txt',
    content: 'native WhatsApp artifact',
  });
  let callbacks;
  const calls = [];
  const socket = {
    sendPresenceUpdate: async () => {},
    readMessages: async () => {},
    sendMessage: async (jid, content, options) => {
      calls.push({ jid, content, options });
      return { key: { id: content.document ? 'file-message-1' : 'text-message-1' } };
    },
  };
  const runtime = new WhatsappRuntime({
    config: linkedConfig(),
    authDir: '/tmp/test-whatsapp-native-file',
    harness: {
      ensureRunning: async () => {},
      sessionExists: async () => true,
      ask: async (_sessionId, _text, options) => {
        assert.equal(typeof options.onArtifact, 'function');
        await options.onArtifact(artifact);
        return '结果文件如下。';
      },
    },
    state: artifactState(),
    createSession: async (options) => {
      callbacks = options;
      return {
        socket,
        ready: Promise.resolve({ accountJid: ACCOUNT_JID, name: 'Harness WhatsApp' }),
        close: async () => {},
        logout: async () => {},
      };
    },
  });
  t.after(() => runtime.stop());
  await runtime.start();
  const inbound = {
    key: { remoteJid: '16505550999@s.whatsapp.net', id: 'native-file-1', fromMe: false },
    message: { conversation: '生成结果文件' },
  };

  await callbacks.onMessage(inbound);

  const textCall = calls.find((call) => call.content.text === '结果文件如下。');
  const fileCall = calls.find((call) => call.content.document);
  assert.ok(textCall);
  assert.ok(fileCall);
  assert.equal(fileCall.jid, '16505550999@s.whatsapp.net');
  assert.equal(fileCall.content.document.toString(), 'native WhatsApp artifact');
  assert.equal(fileCall.content.mimetype, 'text/plain');
  assert.equal(fileCall.content.fileName, 'report.txt');
  assert.equal(fileCall.options.quoted, inbound);
  assert.equal(fileCall.options.mediaUploadTimeoutMs, 120_000);
  assert.equal(
    fileCall.options.messageId,
    createHash('sha256').update(deliveryKey).digest('hex').slice(0, 20).toUpperCase(),
  );
  assert.equal(fileCall.options.messageId.length, 20);
  assert.equal(calls.indexOf(textCall) < calls.indexOf(fileCall), true);
});
