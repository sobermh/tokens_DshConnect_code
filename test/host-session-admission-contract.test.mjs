import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  captureContextEnhancement,
  enhanceContextContent,
} from '../src/channels/shared/context-enhancement.mjs';
import { rewriteInjectedContextMessages } from '../src/channels/shared/injected-context.mjs';

// Session format v4 (dsh 0.2) admits every appended row through
// `assertV4RowAdmission` before it is written, and a row it refuses fails the
// whole append -- the agent turn with it, and every later turn of the Session.
// The retired `{ kind: 'plugin', plugin }` source is one such row: an IM
// message carrying an injected context block wedged its Session that way.
// The plugin's own tests cannot see the rule, so this case feeds the context
// messages the rewriter produces to the installed host's real admission check.
//
// Run against a real install:
//   DSH_HOST_ROOT=<root with node_modules/@deepseek-ai> npm run check:host
const hostRoot = process.env.DSH_HOST_ROOT;
const skip = hostRoot ? false : 'set DSH_HOST_ROOT to an installed host root';

async function loadAdmission() {
  const hostRequire = createRequire(resolve(hostRoot, 'package.json'));
  const name = '@deepseek-ai/dsh-session-format-v3-to-v4';
  const { assertV4RowAdmission } = await import(pathToFileURL(hostRequire.resolve(name)).href);
  assert.equal(typeof assertV4RowAdmission, 'function', `${name} exports assertV4RowAdmission`);
  return assertV4RowAdmission;
}

function imMessage(id, guidance) {
  const enhancement = captureContextEnhancement({
    botId: 'bot_one',
    getSettings: () => ({
      group: { enabled: true, fields: ['channel', 'senderName'], guidance },
      direct: { enabled: false, fields: [], guidance: '' },
    }),
  }, 'group');
  const text = enhanceContextContent('你好', enhancement, () => ({
    channel: 'feishu', senderName: '张三',
  }));
  return { id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user', rpcId: `feishu-${id}` } };
}

function row(message, seq) {
  return JSON.parse(JSON.stringify({
    type: 'user/message', seq, time: Date.now(), data: message, surfaceOp: 'append',
  }));
}

test('HOST-SESSION-01 injected context messages are admitted by the v4 writer', { skip }, async () => {
  const assertV4RowAdmission = await loadAdmission();
  let next = 0;
  const rewritten = rewriteInjectedContextMessages([imMessage('u1', '严肃一点')], {
    newId: () => `ctx_${++next}`,
  });
  // Both block forms the rewriter emits: the notice and the guidance.
  assert.deepEqual(rewritten.map((message) => message.source.form ?? 'user'), ['user', 'notice', 'instructions']);
  rewritten.forEach((message, index) => assertV4RowAdmission(row(message, index + 1)));
});

test('HOST-SESSION-02 the retired plugin wrapper is still refused', { skip }, async () => {
  const assertV4RowAdmission = await loadAdmission();
  // Control: proves the check above can tell the two shapes apart.
  const retired = {
    id: 'ctx_1', role: 'user', content: [{ type: 'text', text: 'feishu · 张三' }],
    source: { kind: 'plugin', plugin: 'dsh-im', form: 'notice', summary: 'feishu · 张三' },
  };
  assert.throws(() => assertV4RowAdmission(row(retired, 1)), /producer-owned source kind/);
});
