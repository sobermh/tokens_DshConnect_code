import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { modernHarnessApi } from '../plugin-src/host/modern-harness-api.mjs';

// Every Harness call this plugin makes goes through the host's Typert gateway,
// and dsh 0.2.1 changed what that gateway requires of the caller: `peer` became
// a required field of `InvokeRemoteRequest` ("every carrier and in-process
// caller names it explicitly") and the gateway's own `operatorPeer()` fallback
// was removed, so `prepareInvocation` reads `peer.signal` before it resolves a
// descriptor.  A bridge that omitted `peer` therefore failed *every* call on
// dsh 0.2.1 with a TypeError, which this bridge reports as `code: 'internal'`
// and the channels show as INTERNAL_UNKNOWN -- in production, as the first call
// of an inbound message, `workspace.list`, failing on a 0.7.x install.
//
// Nothing about that is visible without the real gateway: the plugin's own
// fakes accept any request shape, the manifest's peer gate does not read it,
// and `tsc` never sees it.  These cases drive the bridge through the installed
// host's real `dsh-api-gateway`, its real generated descriptors, and the real
// `Peer` class the host's own `createPeer` builds, with only the business
// receiver replaced.  The connection service itself is not booted (it owns an
// HTTP listener), so `check:host` additionally asserts that the installed host
// still declares the `createPeer` factory this bridge calls in production.
//
// Run against a real install:
//   DSH_HOST_ROOT=<root with node_modules/@deepseek-ai> npm run check:host
const hostRoot = process.env.DSH_HOST_ROOT;
const skip = hostRoot ? false : 'set DSH_HOST_ROOT to an installed host root';

const WORKSPACE = {
  items: [{
    workspaceId: 'workspace',
    path: 'C:/workspace',
    sessionIds: ['session'],
  }],
  archivedSessionIds: [],
  pinnedSessionIds: [],
};

function hostLoader() {
  const hostRequire = createRequire(resolve(hostRoot, 'package.json'));
  return {
    load: (name) => import(pathToFileURL(hostRequire.resolve(name)).href),
    loadFile: (name, file) => import(
      pathToFileURL(resolve(hostRequire.resolve(`${name}/package.json`), '..', file)).href
    ),
    version: (name) => JSON.parse(
      readFileSync(hostRequire.resolve(`${name}/package.json`), 'utf8'),
    ).version,
  };
}

/**
 * The owner Peer a dsh 0.2.0 connection service publishes as
 * `connection.operator`; that host exports no class to build one from.
 *
 * @param ctx - the live Cordis context the Peer's lifetime hangs under.
 * @returns a `PeerScope`-shaped operator Peer.
 */
function operatorPeerShape(ctx) {
  const lifetime = new AbortController();
  return {
    id: 'operator',
    ctx,
    principal: { kind: 'owner' },
    signal: lifetime.signal,
    interactions: 'none',
    dispose: async () => lifetime.abort(new Error('operator Peer disposed')),
  };
}

/**
 * Stand up the installed host's real Typert gateway over its own generated
 * `workspace` descriptors, with a stub receiver for the business method.
 *
 * @returns the live Cordis context, plus what the receiver observed.
 */
async function realGatewayContext({ withConnection }) {
  const { load, loadFile } = hostLoader();
  const cordis = await load('@deepseek-ai/cordis');
  const registry = await load('@deepseek-ai/dsh-typert-registry');
  const gateway = await load('@deepseek-ai/dsh-api-gateway');
  const connection = await load('@deepseek-ai/dsh-client-connection');
  const generated = await loadFile(
    '@deepseek-ai/dsh-api-workspace-controller', 'lib/typert.host.js',
  );

  // The gateway injects `remoteAccess`; owner Peers never reach `decide`, so an
  // allow-all stub keeps these cases on the peer and descriptor paths.
  class RemoteAccessStub extends cordis.Service {
    constructor(ctx) {
      super(ctx, 'remoteAccess');
    }

    decide() {
      return { kind: 'allow' };
    }

    allows() {
      return true;
    }
  }

  const app = new cordis.Context();
  await app.plugin(registry.TypertRegistry);
  await app.plugin(RemoteAccessStub);
  await app.plugin(gateway.TypertGatewayService);

  const contribution = generated.TYPERT;
  const descriptor = contribution.invocations.find(
    (candidate) => candidate.namespace === 'workspace' && candidate.method === 'follow',
  );
  assert.ok(descriptor, 'this host generates no workspace/follow descriptor');
  assert.equal(descriptor.mode, 'stream', 'workspace/follow must stay a stream method');

  // Register the host's own contribution, then serve its `workspace` namespace
  // from a stub whose binding matches what the gateway validates.
  const serviceKey = descriptor.service;
  app.provide(serviceKey, undefined, true);
  const receiver = {
    typertRemote: { serviceKey, namespace: 'workspace' },
    async *follow() {
      yield { type: 'baseline', value: WORKSPACE };
    },
  };
  receiver.typertRemote.service = receiver;
  app.set(serviceKey, receiver);
  app.typert.register(contribution);

  if (withConnection) {
    // Publish the connection surface this host actually has, so the bridge's
    // own capability probe is what gets exercised: dsh 0.2.1 exports the `Peer`
    // class its `createPeer` factory builds, while dsh 0.2.0 has no factory and
    // publishes a ready-made `connection.operator` instead.
    app.provide('connection', undefined, true);
    app.set('connection', typeof connection.Peer === 'function'
      ? { createPeer: (options) => new connection.Peer(app, options) }
      : { operator: operatorPeerShape(app) });
  }
  return app;
}

test('the bridge names a Peer the real gateway accepts', { skip }, async () => {
  const app = await realGatewayContext({ withConnection: true });
  const api = modernHarnessApi(app);
  const listed = await api.workspace.list({ rpcId: 'peer-contract', payload: {} });
  assert.equal(
    listed.result.ok,
    true,
    `workspace.list failed through the real gateway: ${JSON.stringify(listed.result.error)}`,
  );
  assert.deepEqual(
    listed.result.value.items.map((item) => item.path),
    ['C:/workspace'],
    'the baseline the host streamed must reach the channel client unchanged',
  );
});

test('a bridge with no Peer fails wherever the host requires one', { skip }, async () => {
  // Same bridge, same real gateway, no connection service to name a Peer with:
  // this is the 2.9.6 and earlier behaviour, and it must fail here so the case
  // above cannot pass for some unrelated reason. On a host whose gateway still
  // substitutes its own operator Peer (0.2.0) the call succeeds instead, which
  // is why this asserts on the host's declared contract rather than a version.
  const app = await realGatewayContext({ withConnection: false });
  const api = modernHarnessApi(app);
  const listed = await api.workspace.list({ rpcId: 'peerless', payload: {} });
  const requiresPeer = gatewayRequiresPeer();
  if (requiresPeer) {
    assert.equal(listed.result.ok, false, 'this gateway requires a Peer but accepted a request without one');
    assert.equal(listed.result.error.code, 'internal');
    assert.match(
      listed.result.error.message,
      /signal/u,
      `expected the peerless failure this bridge used to produce, got ${
        JSON.stringify(listed.result.error)}`,
    );
  } else {
    assert.equal(
      listed.result.ok,
      true,
      'this gateway declares `peer` optional, so a peerless call must still work',
    );
  }
});

/**
 * Whether the installed gateway declares `peer` as required.
 *
 * Read from the host's own type declaration, which is where the change landed:
 * dsh 0.2.0 declares `readonly peer?: PeerScope`, dsh 0.2.1 `readonly peer:
 * PeerScope`, and dsh 0.1.5 has no such field at all.
 *
 * @returns true when this host requires every caller to name a Peer.
 */
function gatewayRequiresPeer() {
  const hostRequire = createRequire(resolve(hostRoot, 'package.json'));
  const types = resolve(
    hostRequire.resolve('@deepseek-ai/dsh-api-gateway/package.json'),
    '../lib/types/types.d.ts',
  );
  const text = readFileSync(types, 'utf8');
  // Anchor the scan, so a renamed request type fails here instead of reading
  // as "this host asks for no Peer".
  assert.match(
    text,
    /interface InvokeRemoteRequest/u,
    'this host publishes no gateway request type; this scan has lost its anchor',
  );
  const declaration = /readonly peer(\??):\s*PeerScope/u.exec(text);
  return declaration !== null && declaration[1] === '';
}

test('every endpoint the bridge calls exists in the host\'s own descriptors', { skip }, async () => {
  // The bridge sends eleven endpoints; a renamed or withdrawn one is invisible
  // until a channel hits it, because the gateway resolves endpoints by name at
  // call time. Compare against the host's generated descriptors.
  const { loadFile, version } = hostLoader();
  const packages = [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-api-workspace-controller',
  ];
  const declared = new Map();
  for (const name of packages) {
    const generated = await loadFile(name, 'lib/typert.host.js');
    for (const descriptor of generated.TYPERT.invocations) {
      declared.set(`${descriptor.namespace}/${descriptor.method}`, descriptor);
    }
  }
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
  const missing = expected.filter(([endpoint]) => !declared.has(endpoint)).map(([endpoint]) => endpoint);
  assert.deepEqual(
    missing,
    [],
    `this host exports no ${missing.join(', ')}; the bridge calls endpoints it does not have (dsh ${
      version('@deepseek-ai/dsh-api-session-controller')})`,
  );
  for (const [endpoint, mode] of expected) {
    assert.equal(
      declared.get(endpoint).mode,
      mode,
      `${endpoint} changed between unary and stream; the bridge calls it the other way`,
    );
  }
});
