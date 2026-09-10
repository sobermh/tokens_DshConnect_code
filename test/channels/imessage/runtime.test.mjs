import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMessageRuntime,
  createIMessageRuntimeStatus,
} from '../../../src/channels/imessage/runtime.mjs';

function state(cursor = null) {
  return {
    value: cursor,
    cursor() { return this.value; },
    async setCursor(value) { this.value = value; },
    hasSeen() { return false; },
    async markSeen() {},
  };
}

test('iMessage runtime refuses non-macOS hosts before reporting ready', async () => {
  const runtime = new IMessageRuntime({
    config: { platformId: 'macos-messages' },
    token: 'macos-messages-native',
    harness: { async ensureRunning() {} },
    state: state(),
    createApi: () => ({
      async getPermissions() {
        return { platform: 'win32', database: 'unsupported', automation: 'unsupported' };
      },
    }),
  });

  await assert.rejects(() => runtime.start(), (error) => {
    assert.equal(error.code, 'messages-permission-required');
    assert.deepEqual(error.permissions, {
      platform: 'win32', database: 'unsupported', automation: 'unsupported',
    });
    return true;
  });
  assert.equal(runtime.status.ready, false);
  assert.equal(runtime.status.connectionState, 'failed');
});

test('iMessage runtime initializes its durable cursor after both permissions are granted', async () => {
  const currentState = state();
  let listed = false;
  const runtime = new IMessageRuntime({
    config: { platformId: 'macos-messages' },
    token: 'macos-messages-native',
    harness: { async ensureRunning() {} },
    state: currentState,
    pollIntervalMs: 60_000,
    createApi: () => ({
      async getPermissions() {
        return { platform: 'darwin', database: 'granted', automation: 'granted' };
      },
      async getLatestMessageRowId() { return 744; },
      async listMessages() { listed = true; return []; },
      async sendText() { return { sent: true }; },
    }),
  });

  await runtime.start();
  assert.equal(runtime.status.ready, true);
  assert.equal(runtime.status.connectionState, 'connected');
  assert.equal(currentState.cursor(), 744);
  assert.equal(createIMessageRuntimeStatus().lastCheckedAt, null);
  await runtime.stop();
  assert.equal(runtime.status.ready, false);
  assert.equal(listed, false);
});
