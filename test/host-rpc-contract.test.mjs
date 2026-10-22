import assert from 'node:assert/strict';
import test from 'node:test';

import { modernHarnessApi } from '../plugin-src/host/modern-harness-api.mjs';
import {
  SKIP_WITHOUT_HOST,
  gatewayRequiresPeer,
  hostVersion,
  realHostGateway,
} from './support/real-host-gateway.mjs';

// HOST-RPC: every Harness call this plugin makes, once each, against the
// installed host's real Typert gateway and its real generated descriptors.
//
// All eleven endpoints are shared by every channel: an inbound message from any
// IM reaches the host only through this bridge, so a changed gateway contract
// breaks all channels at once -- which is what dsh 0.2.1 did by making the
// request's `peer` field required. The pre-2.9.7 bridge fails every case below
// on that host, and HOST-RPC-12 pins that failure in place so these cases
// cannot pass for an unrelated reason.
//
// Run against a real install (one leg per staged host):
//   DSH_HOST_ROOT=<...>/dsh-plugin-desktop npm run check:host
// Without DSH_HOST_ROOT these cases are reported as not executed, never passed.
const skip = SKIP_WITHOUT_HOST;

const SESSION_ID = 'session';
const WORKSPACE_ID = 'workspace';
const WORKSPACE_PATH = 'C:/workspace';

function workspaceValue() {
  return {
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
  };
}

function sessionRecords() {
  return [
    { type: 'event', event: { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } } },
    {
      type: 'event',
      event: {
        type: 'user/message', seq: 1, time: 1,
        data: { turn: 1, source: { kind: 'user', rpcId: 'prompt' }, message: { content: [] } },
      },
    },
  ];
}

function sessionHeader() {
  return {
    version: 4,
    id: SESSION_ID,
    createdAt: 0,
    isSeeded: false,
    cwd: WORKSPACE_PATH,
  };
}

/**
 * Script both controllers the bridge talks to, recording every call.
 *
 * @returns the scripted receivers plus the call log.
 */
function scriptedControllers() {
  const calls = [];
  const record = (endpoint, request) => {
    calls.push({ endpoint, request });
  };
  const sessionController = {
    list(request) {
      record('session/list', request);
      return { items: [{
        sessionId: SESSION_ID,
        agentAvailable: true,
        updatedAt: 1,
        running: false,
        blank: false,
        cwd: WORKSPACE_PATH,
        projections: {
          // `kind` is required by the host's schema and never appeared in this
          // plugin's hand-written fakes; the real listing always carries it.
          kind: 'sequenced',
          asOfSeq: 1,
          values: { modelSelection: { lastUsed: { provider: 'deepseek', model: 'chat' }, next: null } },
        },
      }] };
    },
    create(request) {
      record('session/create', request);
      return { sessionId: SESSION_ID };
    },
    async *follow(request) {
      record('session/follow', request);
      yield {
        type: 'snapshot',
        header: sessionHeader(),
        cursor: 1,
        records: sessionRecords(),
        hasMore: false,
        projections: { asOfSeq: 1, values: {} },
      };
    },
    page(request) {
      record('session/page', request);
      return { records: sessionRecords(), hasMore: false };
    },
    prompt(request) {
      record('session/prompt', request);
      return { accepted: true };
    },
    rename(request) {
      record('session/rename', request);
      return { title: request.title, seq: 9 };
    },
    cancel(request) {
      record('session/cancel', request);
      return { accepted: true };
    },
    modelCatalog() {
      record('session/modelCatalog', undefined);
      return {
        default: { provider: 'deepseek', model: 'chat' },
        routableProviders: ['deepseek'],
        groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat', name: 'Chat' }] }],
        failures: [],
      };
    },
    selectModel(request) {
      record('session/selectModel', request);
      return { selected: { provider: request.provider, model: request.model } };
    },
  };
  const workspaceController = {
    async *follow() {
      record('workspace/follow', undefined);
      yield { type: 'baseline', value: workspaceValue() };
    },
    create(request) {
      record('workspace/create', request);
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
  return { calls, receivers: { sessionController, workspaceController } };
}

/**
 * One bridge over the installed host's real gateway.
 *
 * @param options - forwarded to the fixture (`withConnection`).
 * @returns the bridge, the call log, and the fixture.
 */
async function bridgeOverRealGateway(options = {}) {
  const { calls, receivers } = scriptedControllers();
  const fixture = await realHostGateway({ receivers, ...options });
  return { api: modernHarnessApi(fixture.app), calls, fixture };
}

/**
 * Assert one bridge call succeeded through the real gateway.
 *
 * @param reply - the bridge's RPC envelope.
 * @param endpoint - the endpoint under test, for the failure message.
 * @returns the unwrapped value.
 */
function ok(reply, endpoint) {
  assert.equal(
    reply.result.ok,
    true,
    `${endpoint} failed through the real gateway: ${JSON.stringify(reply.result.error)}`,
  );
  return reply.result.value;
}

test('HOST-RPC-01 workspace.list reads the host\'s workspace baseline', { skip }, async () => {
  const { api, calls, fixture } = await bridgeOverRealGateway();
  const value = ok(await api.workspace.list({ rpcId: 'rpc-01', payload: {} }), 'workspace/follow');
  assert.deepEqual(value.items.map((item) => item.path), [WORKSPACE_PATH]);
  assert.deepEqual(calls.map((call) => call.endpoint), ['workspace/follow']);
  // The fixture already parsed that baseline with the host's own result schema,
  // where the host publishes one; prove the schema is not accepting anything,
  // so these cases cannot pass on a reply shape the host would never send.
  if (fixture.resultSchemasPublished) {
    assert.throws(
      () => fixture.validateResult('workspace/follow', { type: 'baseline', value: { items: 'no' } }),
      /not the shape the host promises/u,
    );
  }
});

test('HOST-RPC-02 workspace.create registers a directory', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const value = ok(
    await api.workspace.create({ rpcId: 'rpc-02', payload: { path: WORKSPACE_PATH } }),
    'workspace/create',
  );
  assert.equal(value.workspace.path, WORKSPACE_PATH);
  assert.deepEqual(calls.at(-1), { endpoint: 'workspace/create', request: { path: WORKSPACE_PATH } });
});

test('HOST-RPC-03 sessions.list passes the empty request the channels send', { skip }, async () => {
  // Every channel calls this with `{}`; the host validates `_request` strictly,
  // so a field the channels invented would be refused here.
  const { api, calls } = await bridgeOverRealGateway();
  const value = ok(await api.sessions.list({ rpcId: 'rpc-03', payload: {} }), 'session/list');
  assert.deepEqual(value.items.map((item) => item.sessionId), [SESSION_ID]);
  assert.deepEqual(calls.at(-1), { endpoint: 'session/list', request: {} });
});

test('HOST-RPC-04 sessions.create adopts a workspace and session id', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const payload = { workspaceId: WORKSPACE_ID, sessionId: SESSION_ID };
  const value = ok(await api.sessions.create({ rpcId: 'rpc-04', payload }), 'session/create');
  assert.equal(value.sessionId, SESSION_ID);
  assert.deepEqual(calls.at(-1), { endpoint: 'session/create', request: payload });
});

test('HOST-RPC-05 sessions.history opens the follow snapshot', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const value = ok(
    await api.sessions.history({ rpcId: 'rpc-05', payload: { sessionId: SESSION_ID } }),
    'session/follow',
  );
  assert.deepEqual(
    value.events.map(({ event }) => event.type),
    ['turn/start', 'user/message'],
  );
  assert.deepEqual(calls.at(-1).endpoint, 'session/follow');
  assert.deepEqual(calls.at(-1).request.address, { kind: 'session', sessionId: SESSION_ID });
});

test('HOST-RPC-06 sessions.history pages backwards through session/page', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  await api.sessions.history({ rpcId: 'rpc-06-baseline', payload: { sessionId: SESSION_ID } });
  const value = ok(
    await api.sessions.history({
      rpcId: 'rpc-06', payload: { sessionId: SESSION_ID, beforeSeq: 1 },
    }),
    'session/page',
  );
  assert.equal(value.hasMore, false);
  const page = calls.findLast((call) => call.endpoint === 'session/page');
  assert.ok(page, 'the bridge never reached session/page');
  assert.equal(page.request.throughSeq, 1);
  assert.equal(page.request.beforeSeq, 1);
});

test('HOST-RPC-07 sessions.prompt carries its correlation id as requestId', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const value = ok(await api.sessions.prompt({
    rpcId: 'rpc-07',
    payload: {
      sessionId: SESSION_ID,
      mode: 'queue',
      content: [{ type: 'text', text: '您好' }],
      clientTimeZone: 'Asia/Shanghai',
    },
  }), 'session/prompt');
  assert.deepEqual(value, { accepted: true });
  const prompt = calls.at(-1);
  assert.equal(prompt.endpoint, 'session/prompt');
  assert.equal(prompt.request.requestId, 'rpc-07', 'the reply tracker keys turns on this id');
  assert.equal(Object.hasOwn(prompt.request, 'rpcId'), false);
});

test('HOST-RPC-08 sessions.rename retitles a session', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const value = ok(await api.sessions.rename({
    rpcId: 'rpc-08', payload: { sessionId: SESSION_ID, title: '订单查询' },
  }), 'session/rename');
  assert.deepEqual(value, { title: '订单查询', seq: 9 });
  assert.deepEqual(calls.at(-1).request, { sessionId: SESSION_ID, title: '订单查询' });
});

test('HOST-RPC-09 sessions.cancel stops the running turn', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const value = ok(await api.sessions.cancel({
    rpcId: 'rpc-09', payload: { sessionId: SESSION_ID },
  }), 'session/cancel');
  assert.deepEqual(value, { accepted: true });
  assert.deepEqual(calls.at(-1).request, { sessionId: SESSION_ID });
});

test('HOST-RPC-10 llm.models and sessions.models read the model catalog', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const models = ok(await api.llm.models({ rpcId: 'rpc-10a', payload: {} }), 'session/modelCatalog');
  assert.deepEqual(models.groups.map((group) => group.id), ['deepseek']);
  const session = ok(await api.sessions.models({
    rpcId: 'rpc-10b', payload: { sessionId: SESSION_ID },
  }), 'session/modelCatalog + session/list');
  assert.deepEqual(session.current, { provider: 'deepseek', model: 'chat' });
  assert.equal(session.routable, true);
  assert.ok(calls.some((call) => call.endpoint === 'session/modelCatalog'));
  assert.ok(calls.some((call) => call.endpoint === 'session/list'));
});

test('HOST-RPC-11 sessions.selectModel routes a session', { skip }, async () => {
  const { api, calls } = await bridgeOverRealGateway();
  const payload = { sessionId: SESSION_ID, provider: 'deepseek', model: 'chat' };
  const value = ok(await api.sessions.selectModel({ rpcId: 'rpc-11', payload }), 'session/selectModel');
  assert.deepEqual(value.selected, { provider: 'deepseek', model: 'chat' });
  assert.deepEqual(calls.at(-1).request, payload);
});

test('HOST-RPC-12 a bridge that names no Peer is what this host refuses', { skip }, async () => {
  // The control case: the same bridge over the same real gateway with no
  // connection service to name a Peer with -- the behaviour of 2.9.6 and
  // earlier. On a host that requires a Peer (dsh 0.2.1) every call above fails
  // this way; on dsh 0.2.0 and 0.1.5 the gateway substitutes its own operator
  // Peer, so the call must still succeed there.
  const { api } = await bridgeOverRealGateway({ withConnection: false });
  const reply = await api.workspace.list({ rpcId: 'rpc-12', payload: {} });
  if (gatewayRequiresPeer()) {
    assert.equal(
      reply.result.ok,
      false,
      'this gateway requires a Peer but accepted a request without one; the cases above prove nothing',
    );
    assert.equal(reply.result.error.code, 'internal');
    assert.match(
      reply.result.error.message,
      /signal/u,
      `expected the peerless failure seen in production, got ${JSON.stringify(reply.result.error)}`,
    );
  } else {
    assert.equal(
      reply.result.ok,
      true,
      'this gateway declares `peer` optional, so a peerless call must still work',
    );
  }
});

test('HOST-RPC-13 the host exports every endpoint the bridge calls', { skip }, async () => {
  // A renamed or withdrawn endpoint is invisible until a channel hits it,
  // because the gateway resolves endpoints by name at call time.
  const { fixture } = await bridgeOverRealGateway();
  const expected = [
    ['workspace/follow', 'stream'],
    ['workspace/create', undefined],
    ['session/list', undefined],
    ['session/create', undefined],
    ['session/follow', 'stream'],
    ['session/page', undefined],
    ['session/prompt', undefined],
    ['session/rename', undefined],
    ['session/cancel', undefined],
    ['session/modelCatalog', undefined],
    ['session/selectModel', undefined],
  ];
  const missing = expected
    .filter(([endpoint]) => !fixture.descriptors.has(endpoint))
    .map(([endpoint]) => endpoint);
  assert.deepEqual(
    missing,
    [],
    `this host exports no ${missing.join(', ')}; the bridge calls endpoints it does not have (dsh ${
      hostVersion('@deepseek-ai/dsh-api-session-controller')})`,
  );
  for (const [endpoint, mode] of expected) {
    assert.equal(
      fixture.descriptors.get(endpoint).mode,
      mode,
      `${endpoint} changed between unary and stream; the bridge calls it the other way`,
    );
  }
});
