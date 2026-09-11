import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramButtons } from '../../../src/channels/telegram/telegram-buttons.mjs';
import { HarnessApprovalQueue } from '../../../src/channels/shared/harness-approval.mjs';
import { TelegramApi } from '../../../src/channels/telegram/telegram-api.mjs';

test('Bot API subscribes to callbacks and serializes keyboard and acknowledgement payloads', async () => {
  const calls = [];
  const api = new TelegramApi({ token: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef123456',
    fetchImpl: async (url, options) => {
      calls.push({ method: String(url).split('/').at(-1), body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ ok: true, result: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const replyMarkup = { inline_keyboard: [[{ text: 'Approve', callback_data: 'test' }]] };
  await api.getUpdates({ offset: 12 });
  await api.sendMessage({ chatId: 42, text: 'Confirm', replyMarkup });
  await api.answerCallbackQuery({ callbackQueryId: 'q', text: 'Received' });
  await api.editMessageReplyMarkup({ chatId: 42, messageId: 1, replyMarkup: { inline_keyboard: [] } });
  assert.deepEqual(calls[0].body.allowed_updates, ['message', 'callback_query']);
  assert.deepEqual(calls[1].body.reply_markup, replyMarkup);
  assert.deepEqual(calls[2], { method: 'answerCallbackQuery', body: { callback_query_id: 'q', text: 'Received' } });
  assert.deepEqual(calls[3].body, { chat_id: 42, message_id: 1, reply_markup: { inline_keyboard: [] } });
});

function fixture() {
  const notices = [], edits = [], answers = [];
  const buttons = new TelegramButtons({
    answerCallbackQuery: async (value) => notices.push(value),
    editMessageReplyMarkup: async (value) => edits.push(value),
  });
  let active = true;
  const options = { actor: '7', options: [{ label: 'A' }, { label: 'B' }],
    isActive: () => active };
  const target = { chatId: 42, chatType: 'private' };
  const query = (keyboard, index = 0) => ({ id: 'click', from: { id: 7 },
    message: { message_id: 100, chat: { id: 42 } },
    data: keyboard.markup.inline_keyboard[index][0].callback_data });
  const accept = async (message) => { answers.push(message.content); active = false; };
  return { buttons, notices, edits, answers, options, target, query, accept };
}

test('buttons validate actor, chat, message and access policy; consume only once', async () => {
  const f = fixture();
  const keyboard = f.buttons.create(f.target, f.options);
  keyboard.attach(100);
  const q = f.query(keyboard);
  assert.ok(Buffer.byteLength(q.data) <= 64);
  await f.buttons.handle({ ...q, from: { id: 8 } }, f.accept, () => true);
  await f.buttons.handle({ ...q, message: { ...q.message, message_id: 101 } }, f.accept, () => true);
  await f.buttons.handle({ ...q, message: { ...q.message, chat: { id: 43 } } }, f.accept, () => true);
  await f.buttons.handle(q, f.accept, () => false);
  assert.deepEqual(f.answers, []);
  await Promise.all([f.buttons.handle(q, f.accept, () => true), f.buttons.handle(q, f.accept, () => true)]);
  await f.buttons.handle(q, f.accept, () => true);
  assert.deepEqual(f.answers, ['1']);
  assert.deepEqual(f.edits.at(-1).replyMarkup, { inline_keyboard: [] });
});

test('multi-select toggles before explicit submission and permits retry on submission failure', async () => {
  const f = fixture();
  const keyboard = f.buttons.create(f.target, { ...f.options, multiSelect: true });
  keyboard.attach(100);
  for (const index of [0, 1, 0]) await f.buttons.handle(f.query(keyboard, index), f.accept, () => true);
  assert.deepEqual(f.answers, []);
  await assert.rejects(f.buttons.handle(f.query(keyboard, 2), async () => { throw Error('offline'); }, () => true));
  await f.buttons.handle(f.query(keyboard, 2), f.accept, () => true);
  assert.deepEqual(f.answers, ['2']);
});

test('approval button submits the actual Harness outcome and a stale button cannot approve the next operation', async () => {
  const f = fixture();
  const queue = new HarnessApprovalQueue();
  const keyboards = [], outcomes = [];
  for (const approvalId of ['first', 'second']) {
    await queue.handleRequested({ kind: 'approval', rpcId: approvalId, sessionId: 's',
      payload: { type: 'approval/requested', sessionId: 's', approvalId, toolName: 'bash', callId: approvalId },
      toolCall: { callId: approvalId, name: 'bash', arguments: { command: 'pwd' } },
      respond: async (result) => outcomes.push(result.value),
    }, { key: 'direct:42', actor: '7', send: async (_text, metadata) => {
      if (!metadata) return;
      const keyboard = f.buttons.create(f.target, metadata);
      keyboard.attach(100);
      keyboards.push(keyboard);
    } });
  }
  const accept = async (message) => {
    await queue.claimReply({ key: 'direct:42', actor: message.senderId,
      text: message.content, send: async () => {} }).process();
  };
  await f.buttons.handle(f.query(keyboards[0]), accept, () => true);
  await f.buttons.handle(f.query(keyboards[0]), accept, () => true);
  assert.deepEqual(outcomes, [{ sessionId: 's', approvalId: 'first', outcome: 'allowed-once' }]);
  await f.buttons.handle(f.query(keyboards[1], 1), accept, () => true);
  assert.equal(outcomes[1].outcome, 'rejected');
});
