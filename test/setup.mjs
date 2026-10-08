import { beforeEach } from 'node:test';

// Capture both functions before a test enables fake timers, so cleanup always
// targets the real handle rather than the mock timer registry.
const startKeepAlive = globalThis.setInterval;
const stopKeepAlive = globalThis.clearInterval;

// Real hosts have referenced server/subprocess handles. Isolated mocks do not:
// Node 22 can end a worker before an unreferenced AbortSignal timeout fires.
// Hold the loop only for each active test and always release it on completion.
// The runner's explicit timeout still fails stalled tests.
beforeEach(t => {
  const keepAlive = startKeepAlive(() => {}, 1_000);
  t.after(() => stopKeepAlive(keepAlive));
});
