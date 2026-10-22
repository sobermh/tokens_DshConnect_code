import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  HOST_BUS_EVENT_TYPES,
  LIVE_CHUNK_WIRE_TYPE,
  modernHarnessApi,
} from '../plugin-src/host/modern-harness-api.mjs';
import {
  ASSISTANT_LIVE_CHUNK_EVENT_TYPES,
  ASSISTANT_SETTLEMENT_EVENT_TYPE,
  HarnessReplyTracker,
} from '../src/channels/shared/harness-client.mjs';

// The IM typewriter effect does not ride on a Session event.  The host
// publishes one in-flight model attempt as `agent/assistant-stream` frames;
// this plugin's host bridge folds them into transient history entries, exactly
// as DSH's own Web client does under the name `assistant/live-chunk`.  Nothing
// in that path is covered by `KNOWN_SESSION_EVENT_TYPES`, so a fixture written
// by hand proves only that the fixture matches the code.  These cases build
// the frames with the *host's own* stream packer instead, which is what
// decides the payload shape, and then assert the channel client rebuilds the
// same final text the durable `assistant/message` carries.
//
// Run against a real install:
//   DSH_HOST_ROOT=<root with node_modules/@deepseek-ai> npm run check:host
const hostRoot = process.env.DSH_HOST_ROOT;
const skip = hostRoot ? false : 'set DSH_HOST_ROOT to an installed host root';

const PROMPT_RPC_ID = 'live-chunk-contract';
const SESSION_ID = 'session';

function asyncValues(...values) {
  return { async *[Symbol.asyncIterator]() { yield* values; } };
}

function fakeContext(gateway) {
  const listeners = new Map();
  const ctx = {
    root: {},
    typertGateway: gateway,
    on(event, listener) {
      const entries = listeners.get(event) ?? [];
      entries.push(listener);
      listeners.set(event, entries);
      return () => {
        const index = entries.indexOf(listener);
        if (index >= 0) entries.splice(index, 1);
      };
    },
  };
  return {
    ctx,
    emit(event, ...args) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
    },
  };
}

/**
 * Load one host entry point, with the version of the package providing it.
 * `name` may be a subpath export, which has no `package.json` of its own, so
 * the version is read from the owning package instead.
 */
async function loadFromHost(name) {
  const hostRequire = createRequire(resolve(hostRoot, 'package.json'));
  const owner = name.split('/').slice(0, 2).join('/');
  const manifest = JSON.parse(readFileSync(hostRequire.resolve(`${owner}/package.json`), 'utf8'));
  return {
    api: await import(pathToFileURL(hostRequire.resolve(name)).href),
    version: manifest.version,
  };
}

test('the bridge only writes a live-chunk name the channel client reads', () => {
  assert.ok(
    ASSISTANT_LIVE_CHUNK_EVENT_TYPES.has(LIVE_CHUNK_WIRE_TYPE),
    `the bridge writes ${LIVE_CHUNK_WIRE_TYPE}, which the client would drop`,
  );
  // DSH's own client-only name must stay readable even though no bridge
  // writes it today: that is the name an upstream transport would hand us.
  assert.ok(ASSISTANT_LIVE_CHUNK_EVENT_TYPES.has('assistant/live-chunk'));
});

test('the host declares every Cordis event the bridge subscribes to', { skip }, async () => {
  const session = await loadFromHost('@deepseek-ai/dsh-session');
  const vocabulary = session.api.KNOWN_SESSION_EVENT_TYPES;
  assert.ok(vocabulary instanceof Set, 'KNOWN_SESSION_EVENT_TYPES must be a Set');

  // The durable settlement is a real Session event, so the vocabulary decides
  // it.  The live names are client-side folds and must not be looked for here
  // -- expecting one would fail on every host, which is how T0030 was read as
  // a defect in the first place.
  assert.ok(
    vocabulary.has(ASSISTANT_SETTLEMENT_EVENT_TYPE),
    `this host writes no ${ASSISTANT_SETTLEMENT_EVENT_TYPE}; it has ${
      [...vocabulary].filter((type) => type.startsWith('assistant/')).join(', ') || 'no assistant event'
    }`,
  );
  for (const type of ASSISTANT_LIVE_CHUNK_EVENT_TYPES) {
    assert.equal(
      vocabulary.has(type),
      false,
      `${type} became a durable Session event on dsh ${session.version}; the bridge's own fold now shadows it`,
    );
  }
});

test('the host packs live chunks into the shape the bridge reads', { skip }, async () => {
  const llm = await loadFromHost('@deepseek-ai/dsh-llm/assistant-stream');
  const { AssistantStreamAccumulator, expandAssistantStream, joinAssistantStreamText } = llm.api;
  assert.equal(typeof AssistantStreamAccumulator, 'function');

  // Let the host build the attempt: the accumulator decides how fragments pack
  // and what each chunk looks like when expanded, and `joinAssistantStreamText`
  // is the host's own answer for "what did this attempt say".
  const accumulator = new AssistantStreamAccumulator();
  let time = 1_000;
  for (const text of ['先算一下', '：6 × 7', ' = 42']) {
    accumulator.push({ time: (time += 11), chunk: { type: 'text-delta', index: 0, text } });
  }
  const stream = accumulator.snapshot();
  const timed = expandAssistantStream(stream);
  const settledText = joinAssistantStreamText(stream);
  assert.equal(settledText, '先算一下：6 × 7 = 42');

  const records = [
    { type: 'event', event: { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } } },
    {
      type: 'event',
      event: {
        type: 'user/message', seq: 1, time: 1,
        data: { turn: 1, source: { kind: 'user', rpcId: PROMPT_RPC_ID }, message: { content: [] } },
      },
    },
  ];
  const gateway = {
    async invoke(request) {
      assert.equal(`${request.namespace}/${request.method}`, 'session/page');
      return { records, hasMore: false };
    },
    async stream(request) {
      assert.equal(`${request.namespace}/${request.method}`, 'session/follow');
      return asyncValues({
        type: 'snapshot', cursor: 1, records, hasMore: false,
        projections: { asOfSeq: 1, values: {} },
      });
    },
  };
  const fixture = fakeContext(gateway);
  const api = modernHarnessApi(fixture.ctx);
  const tracker = new HarnessReplyTracker({ promptRpcId: PROMPT_RPC_ID });
  const agent = { session: { id: SESSION_ID, seq: 2 } };

  // Baseline poll so the bridge knows the Session cursor, then the prompt's
  // own durable events reach the tracker.
  const baseline = await api.sessions.history({ rpcId: 'baseline', payload: { sessionId: SESSION_ID } });
  tracker.consumeAll(baseline.result.value.events);
  assert.equal(tracker.turn, 1, 'the tracker must adopt the turn its prompt opened');

  fixture.emit('agent/assistant-stream', {
    agent,
    frame: { type: 'start', attemptId: 'session:1', revision: 1, turn: 1, step: 0 },
  });

  // One poll per published chunk, which is what a channel runtime does: each
  // poll must show strictly more text than the last, or there is no typewriter.
  const seen = [];
  for (const [index, member] of timed.entries()) {
    fixture.emit('agent/assistant-stream', {
      agent,
      frame: {
        // The host allocates one revision per emitted frame from a counter the
        // attached agent owns, so an attempt's frames run start, chunk 0,
        // chunk 1, ... -- see the revision-contract case below.
        type: 'chunk', attemptId: 'session:1', revision: index + 2,
        index, time: member.time, chunk: member.chunk,
      },
    });
    const page = await api.sessions.history({ rpcId: `live-${index}`, payload: { sessionId: SESSION_ID } });
    const live = page.result.value.events.filter(
      ({ event }) => ASSISTANT_LIVE_CHUNK_EVENT_TYPES.has(event.type),
    );
    assert.equal(live.length, index + 1, 'every published chunk must stay visible until settlement');
    const updates = tracker.consumeAll(page.result.value.events);
    const text = updates.filter((update) => update.type === 'text').at(-1)?.text;
    if (text !== undefined) seen.push(text);
  }
  assert.ok(seen.length >= 2, `expected incremental text updates, saw ${JSON.stringify(seen)}`);
  for (const [index, text] of seen.entries()) {
    if (index === 0) continue;
    assert.ok(text.startsWith(seen[index - 1]), `${JSON.stringify(text)} is not a continuation`);
    assert.ok(text.length > seen[index - 1].length, 'each poll must add text');
  }
  assert.ok(settledText.startsWith(seen.at(-1)), 'the streamed prefix must match the settled text');

  // Settlement: the host commits the same stream as one durable
  // `assistant/message` and then ends the attempt, so the transient entries go
  // away and the final text must be identical to what streamed.
  records.push({
    type: 'event',
    event: {
      type: ASSISTANT_SETTLEMENT_EVENT_TYPE, seq: 2, time: time + 1,
      data: {
        turn: 1, step: 0, stream,
        message: { content: [{ type: 'text', text: settledText }] },
      },
    },
  });
  fixture.emit('agent/assistant-stream', {
    agent,
    frame: {
      type: 'end', attemptId: 'session:1', revision: timed.length + 2, index: timed.length,
      outcome: { kind: 'committed', eventType: ASSISTANT_SETTLEMENT_EVENT_TYPE, seq: 2 },
    },
  });
  records.push({
    type: 'event',
    event: { type: 'turn/end', seq: 3, time: time + 2, data: { turn: 1, reason: 'completed' } },
  });
  const settled = await api.sessions.history({ rpcId: 'settled', payload: { sessionId: SESSION_ID } });
  assert.equal(
    settled.result.value.events.some(({ event }) => ASSISTANT_LIVE_CHUNK_EVENT_TYPES.has(event.type)),
    false,
    'the bridge must drop its transient entries once the attempt settles',
  );
  tracker.consumeAll(settled.result.value.events);
  assert.equal(tracker.answer, settledText, 'the streamed text and the durable message must agree');
  assert.equal(tracker.finished, true);
});

test('a live chunk under DSH\'s own name streams the same way', { skip }, async () => {
  // No bridge writes `assistant/live-chunk` today, so this is the only case
  // that holds the second accepted name honest.
  const llm = await loadFromHost('@deepseek-ai/dsh-llm/assistant-stream');
  const accumulator = new llm.api.AssistantStreamAccumulator();
  let time = 2_000;
  for (const text of ['收到', '，稍等']) {
    accumulator.push({ time: (time += 5), chunk: { type: 'text-delta', index: 0, text } });
  }
  const stream = accumulator.snapshot();
  const expected = llm.api.joinAssistantStreamText(stream);

  const tracker = new HarnessReplyTracker({ promptRpcId: PROMPT_RPC_ID });
  tracker.consumeAll([
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    { type: 'user/message', seq: 2, data: { turn: 1, source: { rpcId: PROMPT_RPC_ID } } },
  ]);
  const updates = tracker.consumeAll(llm.api.expandAssistantStream(stream).map((member, index) => ({
    type: 'assistant/live-chunk',
    seq: 2 + (index + 1) / (stream.length + 4),
    time: member.time,
    data: { attemptId: 'session:1', turn: 1, step: 0, chunk: member.chunk },
  })));
  assert.deepEqual(
    updates.filter((update) => update.type === 'text').map((update) => update.text),
    [expected],
    'the batch must collapse to the full accumulated text',
  );
  assert.equal(tracker.answer, expected);
});

test('the host still numbers assistant frames the way the bridge pairs them', { skip }, async () => {
  // The bridge pairs a chunk to its attempt by `(attemptId, revision, index)`,
  // which only works because of two host facts: `revision` is allocated once
  // per emitted frame from a counter the attached agent owns (so one attempt's
  // frames are consecutive), and a replacement agent restarts both that counter
  // and the attempt counter (so the attempt id alone cannot identify the live
  // attempt).  Neither fact is reachable through an export -- the attempt class
  // is internal -- so read them from the host's own published contract and its
  // shipped loop, where a change necessarily appears.  A failure here means the
  // numbering moved and `#acceptAssistantStream` has to be re-derived, not that
  // this case needs relaxing.
  const hostRequire = createRequire(resolve(hostRoot, 'package.json'));
  const declared = readFileSync(
    resolve(
      hostRequire.resolve('@deepseek-ai/dsh-agent/package.json'),
      '../lib/types/runtime-types.d.ts',
    ),
    'utf8',
  );
  assert.match(
    declared,
    /replacement restarts at 1/u,
    'this host no longer documents the revision restart the bridge keys its restarts on',
  );
  const loop = readFileSync(
    resolve(hostRequire.resolve('@deepseek-ai/dsh-agent-loop/package.json'), '../lib/index.js'),
    'utf8',
  );
  assert.equal(
    loop.match(/revision: this\.nextRevision\(\)/gu)?.length,
    4,
    'the loop no longer allocates exactly one revision per emitted frame (start, chunk, settle, abandon)',
  );
  assert.match(
    loop,
    /\(\) => \+\+this\.assistantStreamRevision/u,
    'the revision counter is no longer a per-agent field the attempt increments',
  );
  assert.match(
    loop,
    /\+\+this\.assistantAttemptCounter/u,
    'the attempt counter is no longer per-agent, so attempt ids may no longer repeat',
  );
});

test('a replaced attempt keeps the typewriter moving', { skip }, async () => {
  // An agent replaced mid-attempt -- clear, compact or resume -- restarts both
  // the attempt counter and the frame revision, so the replacement publishes
  // the attempt id `session:1` and revision 1 a second time while the lifecycle
  // it replaced can still deliver its terminal frame under that shared id.
  // Both attempts are built by the host's own accumulator, so the frames carry
  // the payload the host would really send.
  const llm = await loadFromHost('@deepseek-ai/dsh-llm/assistant-stream');
  const { AssistantStreamAccumulator, expandAssistantStream, joinAssistantStreamText } = llm.api;
  const attempt = (texts, from) => {
    const accumulator = new AssistantStreamAccumulator();
    let time = from;
    for (const text of texts) {
      accumulator.push({ time: (time += 7), chunk: { type: 'text-delta', index: 0, text } });
    }
    const stream = accumulator.snapshot();
    return { members: expandAssistantStream(stream), stream, text: joinAssistantStreamText(stream) };
  };
  const abandoned = attempt(['稍等', '，我查一下'], 1_000);
  const replacement = attempt(['查到了', '：订单 ', 'A-42 已发货'], 2_000);

  const records = [
    { type: 'event', event: { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } } },
    {
      type: 'event',
      event: {
        type: 'user/message', seq: 1, time: 1,
        data: { turn: 1, source: { kind: 'user', rpcId: PROMPT_RPC_ID }, message: { content: [] } },
      },
    },
  ];
  const gateway = {
    async invoke() { return { records, hasMore: false }; },
    async stream() {
      return asyncValues({
        type: 'snapshot', cursor: 1, records, hasMore: false,
        projections: { asOfSeq: 1, values: {} },
      });
    },
  };
  const fixture = fakeContext(gateway);
  const api = modernHarnessApi(fixture.ctx);
  const tracker = new HarnessReplyTracker({ promptRpcId: PROMPT_RPC_ID });
  const agent = { session: { id: SESSION_ID, seq: 2 } };
  const publish = (frame) => fixture.emit('agent/assistant-stream', { agent, frame });
  const poll = async (rpcId) => {
    const page = await api.sessions.history({ rpcId, payload: { sessionId: SESSION_ID } });
    const live = page.result.value.events.filter(
      ({ event }) => ASSISTANT_LIVE_CHUNK_EVENT_TYPES.has(event.type),
    );
    const updates = tracker.consumeAll(page.result.value.events);
    return { live, text: updates.filter((update) => update.type === 'text').at(-1)?.text };
  };

  const baseline = await api.sessions.history({ rpcId: 'baseline', payload: { sessionId: SESSION_ID } });
  tracker.consumeAll(baseline.result.value.events);
  assert.equal(tracker.turn, 1);

  // The attempt that gets replaced: its visible prefix is what the user has
  // already read, and the typewriter must never go backwards from it.
  const seen = [];
  publish({ type: 'start', attemptId: 'session:1', revision: 1, turn: 1, step: 0 });
  for (const [index, member] of abandoned.members.entries()) {
    publish({
      type: 'chunk', attemptId: 'session:1', revision: index + 2,
      index, time: member.time, chunk: member.chunk,
    });
    const { live, text } = await poll(`abandoned-${index}`);
    assert.equal(live.length, index + 1);
    if (text !== undefined) seen.push(text);
  }

  // The replacement opens its attempt, and only then does the lifecycle it
  // replaced report the abandonment of the attempt id they share.
  publish({ type: 'start', attemptId: 'session:1', revision: 1, turn: 1, step: 0 });
  publish({
    type: 'end', attemptId: 'session:1', revision: abandoned.members.length + 2,
    index: abandoned.members.length, outcome: { kind: 'abandoned' },
  });
  const restarted = await poll('restarted');
  assert.deepEqual(restarted.live, [], 'the restart must clear the replaced attempt\'s entries');

  for (const [index, member] of replacement.members.entries()) {
    publish({
      type: 'chunk', attemptId: 'session:1', revision: index + 2,
      index, time: member.time, chunk: member.chunk,
    });
    const { live, text } = await poll(`replacement-${index}`);
    assert.equal(
      live.length,
      index + 1,
      'every chunk the replacement publishes must stay visible until it settles',
    );
    if (text !== undefined) seen.push(text);
  }
  assert.ok(
    seen.length > abandoned.members.length,
    `the replacement published nothing the client could read: ${JSON.stringify(seen)}`,
  );
  for (const [index, text] of seen.entries()) {
    if (index === 0) continue;
    assert.ok(text.startsWith(seen[index - 1]), `${JSON.stringify(text)} is not a continuation`);
    assert.ok(text.length > seen[index - 1].length, 'each poll must add text');
  }

  // Settlement commits the replacement's stream as the durable message, which
  // is the text that must stand once the transient entries go away.
  records.push({
    type: 'event',
    event: {
      type: ASSISTANT_SETTLEMENT_EVENT_TYPE, seq: 2, time: 3_000,
      data: {
        turn: 1, step: 0, stream: replacement.stream,
        message: { content: [{ type: 'text', text: replacement.text }] },
      },
    },
  });
  publish({
    type: 'end', attemptId: 'session:1', revision: replacement.members.length + 2,
    index: replacement.members.length,
    outcome: { kind: 'committed', eventType: ASSISTANT_SETTLEMENT_EVENT_TYPE, seq: 2 },
  });
  records.push({
    type: 'event',
    event: { type: 'turn/end', seq: 3, time: 3_001, data: { turn: 1, reason: 'completed' } },
  });
  const settled = await poll('settled');
  assert.deepEqual(settled.live, [], 'the bridge must drop its transient entries once the attempt settles');
  assert.equal(
    tracker.answer,
    replacement.text,
    'the durable message of the attempt that actually settled must be the final answer',
  );
  assert.equal(tracker.finished, true);
});

test('the declared Cordis surface matches the host\'s own type surface', { skip }, async () => {
  // `ctx.on` accepts any string, so a host-side rename is silent: the feature
  // just stops working, as the run_code dispatch names did in dsh 0.1.5.  The
  // host publishes its Cordis surface in the packages' own type declarations,
  // which is the thing that changes on a rename.
  const { declaredHostBusEvents } = await import('../scripts/host-bus-events.mjs');
  const declared = declaredHostBusEvents(hostRoot);
  const missing = HOST_BUS_EVENT_TYPES.filter((type) => !declared.has(type));
  assert.deepEqual(
    missing,
    [],
    `this host declares no listener for ${missing.join(', ')}; the bridge subscribes to names it never fires`,
  );
  // Prove the scan is not vacuously passing everything.
  assert.equal(declared.has('agent/assistant-stream-renamed'), false);
});
