import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  OUTBOUND_ARTIFACT_TOOL,
  OutboundArtifactRegistry,
  createOutboundArtifactTool,
} from '../../../src/channels/shared/semantic/artifact.mjs';
import { setImHostLanguage } from '../../../src/channels/shared/i18n.mjs';
import {
  TELEGRAM_ACCESS_MODES,
  TelegramConfigStore,
  deriveTelegramBotIdentity,
  normalizeTelegramAccessPolicy,
} from '../../../src/channels/telegram/config-store.mjs';
import { TelegramController } from '../../../src/channels/telegram/telegram-controller.mjs';
import {
  TelegramApi,
  COMMANDS_MENU_BUTTON,
  inspectTelegramToken,
  validTelegramToken,
} from '../../../src/channels/telegram/telegram-api.mjs';
import { TelegramHarnessBridge } from '../../../src/channels/telegram/telegram-bridge.mjs';
import {
  TelegramBotClient,
  TelegramRuntime,
  TELEGRAM_COMMAND_MENU,
  normalizeTelegramUpdate,
  telegramCommandMenu,
  telegramInboundAllowed,
} from '../../../src/channels/telegram/telegram-runtime.mjs';
import { TelegramStateStore } from '../../../src/channels/telegram/state-store.mjs';
import {
  TELEGRAM_ENDPOINTS,
  createTelegramRpcHandler,
} from '../../../plugin-src/host/channels/telegram/rpc.mjs';

const TOKEN = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef123456';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function credentials() {
  const values = new Map();
  return {
    values,
    async resolve(ref) {
      return values.has(ref) ? { value: values.get(ref), source: 'test' } : undefined;
    },
    async set(ref, value) { values.set(ref, value); },
    async unset(ref) { values.delete(ref); },
  };
}

function memoryState() {
  const sessions = new Map();
  const seen = new Set();
  return {
    sessionFor: (key) => sessions.get(key) ?? null,
    setSession: async (key, value) => sessions.set(key, value),
    clearSession: async (key) => sessions.delete(key),
    hasSeen: (id) => seen.has(id),
    markSeen: async (id) => seen.add(id),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function bounded(promise, message, timeoutMs = 1_000) {
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

async function committedTelegramArtifact(t, {
  suffix,
  fileName,
  content,
}) {
  const workspace = await mkdtemp(join(tmpdir(), `dsh-im-telegram-artifact-${suffix}-`));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const sessionId = `session-telegram-artifact-${suffix}`;
  let nextId = 0;
  const registry = new OutboundArtifactRegistry({
    uuid: () => `${suffix}-${++nextId}`,
  });
  t.after(() => registry.clear());
  const agent = {
    session: {
      header: { id: sessionId, cwd: workspace },
      events: [
        { type: 'turn/start', data: { turn: 1 } },
        { type: 'user/message', data: { turn: 1, source: { rpcId: `rpc-${suffix}` } } },
      ],
    },
  };
  await writeFile(join(workspace, fileName), content);
  const tool = createOutboundArtifactTool({ registry });
  const execution = {
    name: OUTBOUND_ARTIFACT_TOOL,
    callId: `call-${suffix}`,
    rootCallId: `call-${suffix}`,
    token: Symbol(`call-${suffix}`),
    agent,
  };
  await tool.definition.execute({ path: fileName }, execution);
  tool.onResult(execution, { isError: false });
  return registry.take(sessionId, 1)[0];
}

for (const mode of ['text', 'single', 'multi']) test(`Telegram runtime keeps polling while a Harness question waits for its ${mode} answer`, async () => {
  const useButtons = mode !== 'text';
  const multiSelect = mode === 'multi';
  const directory = await mkdtemp(join(tmpdir(), 'dsh-im-telegram-interaction-'));
  const state = await new TelegramStateStore(join(directory, 'state.json')).load();
  const questionSent = deferred();
  const secondPollStarted = deferred();
  const answerSubmitted = deferred();
  const releaseTurn = deferred();
  const finalReplySent = deferred();
  const pollOffsets = [];
  const asked = [];
  const selectionUpdated = deferred();
  let submitCallback;
  let answerUpdateDelivered = false;
  let originalTurnEnded = false;
  let nextOutboundMessageId = 500;

  const promptUpdate = {
    update_id: 10,
    message: {
      message_id: 100,
      chat: { id: 42, type: 'private' },
      from: { id: 7, is_bot: false },
      text: '请先询问测试环境',
    },
  };
  const answerUpdate = {
    update_id: 11,
    message: {
      message_id: 101,
      chat: { id: 42, type: 'private' },
      from: { id: 7, is_bot: false },
      text: '2',
    },
  };
  const fakeApi = {
    getMe: async () => ({ id: 123456789, is_bot: true }),
    getWebhookInfo: async () => ({ url: '' }),
    getUpdates: async ({ offset, timeout, signal }) => {
      pollOffsets.push(offset);
      if (timeout === 0) return [];
      if (offset === 0) return [promptUpdate];
      if (offset === 11) {
        secondPollStarted.resolve(originalTurnEnded);
        await questionSent.promise;
        answerUpdateDelivered = true;
        return [answerUpdate];
      }
      if (multiSelect && offset === 12) {
        await selectionUpdated.promise;
        await new Promise((resolve) => setImmediate(resolve));
        return [{ update_id: 12, callback_query: submitCallback }];
      }
      assert.equal(offset, multiSelect ? 13 : 12);
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
    sendChatAction: async () => true,
    answerCallbackQuery: async () => true,
    editMessageReplyMarkup: async () => { selectionUpdated.resolve(); return true; },
    sendMessage: async ({ text, replyMarkup }) => {
      const messageId = nextOutboundMessageId;
      nextOutboundMessageId += 1;
      if (text.includes('请选择测试环境')) {
        if (useButtons) {
          delete answerUpdate.message;
          answerUpdate.callback_query = {
            id: 'answer-11', from: { id: 7 },
            message: { message_id: messageId, chat: { id: 42, type: 'private' } },
            data: replyMarkup.inline_keyboard[1][0].callback_data,
          };
          if (multiSelect) submitCallback = {
            ...answerUpdate.callback_query,
            id: 'answer-12',
            data: replyMarkup.inline_keyboard.at(-1)[0].callback_data,
          };
        }
        questionSent.resolve();
      }
      return { message_id: messageId };
    },
    sendRichMessageDraft: async () => true,
    sendRichMessage: async ({ richMessage }) => {
      if (richMessage.markdown === '已选择生产环境') finalReplySent.resolve();
      const messageId = nextOutboundMessageId;
      nextOutboundMessageId += 1;
      return { message_id: messageId };
    },
    editMessageText: async ({ text }) => {
      if (text === '已选择生产环境') finalReplySent.resolve();
      return true;
    },
  };
  const harness = {
    ensureRunning: async () => true,
    createSession: async () => 'session-runtime-interaction',
    ask: async (sessionId, text, options) => {
      asked.push({ sessionId, text });
      if (text !== '请先询问测试环境') return '不应将答案当成新 prompt';
      await options.onInteraction({
        kind: 'question',
        interactionId: 'telegram-runtime-question',
        rpcId: 'telegram-runtime-question',
        sessionId,
        payload: {
          type: 'question/requested',
          sessionId,
          questions: [{
            id: 'environment',
            multiSelect,
            question: '请选择测试环境',
            options: [{ label: '测试环境' }, { label: '生产环境' }],
          }],
        },
        respond: async (result) => {
          assert.equal(answerUpdateDelivered, true);
          assert.equal(originalTurnEnded, false);
          answerSubmitted.resolve(result);
          return { accepted: true };
        },
      });
      await Promise.race([
        answerSubmitted.promise,
        new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        }),
      ]);
      await releaseTurn.promise;
      originalTurnEnded = true;
      return '已选择生产环境';
    },
  };
  const runtime = new TelegramRuntime({
    config: {
      botId: 'telegram_interaction',
      platformId: '123456789',
      username: 'HarnessBot',
    },
    token: TOKEN,
    harness,
    state,
    createApi: () => fakeApi,
    logger: { error() {}, warn() {} },
    allowedPrivateUserIds: ['7'],
  });

  try {
    await runtime.start();
    assert.equal(await bounded(
      secondPollStarted.promise,
      'poller did not request the answer update while the first turn was active',
    ), false);
    const submitted = await bounded(
      answerSubmitted.promise,
      'the Telegram answer was not submitted through the interaction fast path',
    );
    assert.deepEqual(submitted, {
      ok: true,
      value: {
        sessionId: 'session-runtime-interaction',
        answer: {
          answers: [{ id: 'environment', selected: ['生产环境'] }],
        },
      },
    });
    assert.equal(originalTurnEnded, false);
    assert.deepEqual(asked, [{
      sessionId: 'session-runtime-interaction',
      text: '请先询问测试环境',
    }]);

    await bounded((async () => {
      while (state.cursor() !== (multiSelect ? 13 : 12)) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })(), 'Telegram cursor did not advance past the answer update');
    assert.deepEqual(pollOffsets.slice(0, 4), [-1, 0, 11, 12]);
    assert.equal(state.hasSeen('10'), true);
    assert.equal(state.hasSeen(multiSelect ? 'callback:answer-12' : '11'), true);

    releaseTurn.resolve();
    await bounded(finalReplySent.promise, 'the original Harness turn did not finish');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(originalTurnEnded, true);
    assert.deepEqual(asked, [{
      sessionId: 'session-runtime-interaction',
      text: '请先询问测试环境',
    }]);
  } finally {
    releaseTurn.resolve();
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
