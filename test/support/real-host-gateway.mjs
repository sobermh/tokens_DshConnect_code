import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Shared fixture for the resident host-contract suites.
//
// Everything between this plugin and the host's business layer is the real
// thing: the installed host's Cordis runtime, its Typert registry, its Typert
// gateway, its generated invocation descriptors (so every argument this plugin
// sends is validated by the host's own strict codecs) and the real `Peer` class
// its connection service builds. Only the controller methods themselves are
// scripted, because the real ones need a Profile, a model provider and a live
// agent loop; each scripted reply is validated against the descriptor's own
// generated result schema, so a reply this plugin consumes is one the host
// promises to return.
//
// What this fixture therefore proves, and what it does not: it catches a
// changed gateway contract, a renamed or withdrawn endpoint, a changed argument
// or result shape, and anything the bridge gets wrong on that path -- the whole
// class of break that made every channel fail on dsh 0.2.1. It does not prove
// model replies, persistence or approval behaviour on a live host.

export const HOST_ROOT = process.env.DSH_HOST_ROOT;
/** Reason these suites did not execute, or false when a host is configured. */
export const SKIP_WITHOUT_HOST = HOST_ROOT
  ? false
  : 'NOT EXECUTED: set DSH_HOST_ROOT to an installed host root (dsh-plugin-desktop)';

const CONTROLLER_PACKAGES = [
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
];

function hostRequire() {
  return createRequire(resolve(HOST_ROOT, 'package.json'));
}

/**
 * Read one installed host package's version.
 *
 * @param name - package name resolvable from the host root.
 * @returns the installed version string.
 */
export function hostVersion(name) {
  return JSON.parse(readFileSync(hostRequire().resolve(`${name}/package.json`), 'utf8')).version;
}

/**
 * Read one file shipped inside an installed host package.
 *
 * @param name - package name resolvable from the host root.
 * @param file - path inside that package.
 * @returns the file's text.
 */
export function hostFile(name, file) {
  return readFileSync(
    resolve(hostRequire().resolve(`${name}/package.json`), '..', file),
    'utf8',
  );
}

async function loadHost(name) {
  return import(pathToFileURL(hostRequire().resolve(name)).href);
}

async function loadHostFile(name, file) {
  return import(pathToFileURL(
    resolve(hostRequire().resolve(`${name}/package.json`), '..', file),
  ).href);
}

/**
 * Whether the installed gateway requires every caller to name a Peer.
 *
 * dsh 0.2.0 declares `readonly peer?: PeerScope` and substitutes its own
 * operator Peer; dsh 0.2.1 declares it required and reads `peer.signal` before
 * resolving a descriptor; dsh 0.1.5 has no such field.
 *
 * @returns true when a call with no Peer cannot succeed on this host.
 */
export function gatewayRequiresPeer() {
  const text = hostFile('@deepseek-ai/dsh-api-gateway', 'lib/types/types.d.ts');
  // Anchor the scan, so a renamed request type fails loudly instead of reading
  // as "this host asks for no Peer".
  assert.match(
    text,
    /interface InvokeRemoteRequest/u,
    'this host publishes no gateway request type; this scan has lost its anchor',
  );
  const declaration = /readonly peer(\??):\s*PeerScope/u.exec(text);
  return declaration !== null && declaration[1] === '';
}

/**
 * The owner Peer a dsh 0.2.0 connection service publishes as
 * `connection.operator`; that host exports no class to build one from.
 *
 * @param ctx - the Cordis context the Peer's lifetime hangs under.
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
 * Boot the installed host's real gateway over its own generated descriptors.
 *
 * @param options - `receivers` maps a Cordis service key to the scripted
 *   controller serving it; `withConnection` false omits the connection service,
 *   leaving the bridge with no Peer to name (the pre-2.9.7 behaviour).
 * @returns the live context, the registered descriptors, and a result-schema
 *   validator bound to them.
 */
export async function realHostGateway({ receivers, withConnection = true }) {
  const cordis = await loadHost('@deepseek-ai/cordis');
  const registry = await loadHost('@deepseek-ai/dsh-typert-registry');
  const gateway = await loadHost('@deepseek-ai/dsh-api-gateway');
  const connection = await loadHost('@deepseek-ai/dsh-client-connection');

  // The gateway injects `remoteAccess`; owner Peers never reach `decide`, so an
  // allow-all stub keeps these suites on the gateway and descriptor paths.
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

  const descriptors = new Map();
  for (const name of CONTROLLER_PACKAGES) {
    const generated = await loadHostFile(name, 'lib/typert.host.js');
    for (const descriptor of generated.TYPERT.invocations) {
      descriptors.set(`${descriptor.namespace}/${descriptor.method}`, descriptor);
    }
    app.typert.register(generated.TYPERT);
  }

  const resultSchema = (endpoint) => {
    const descriptor = descriptors.get(endpoint);
    assert.ok(descriptor, `this host declares no ${endpoint}`);
    // Where the live result schema lives moved twice: dsh 0.2.1 wraps the codec
    // as `{ spec, projection }` with a `create()` factory, dsh 0.2.0 puts that
    // codec straight on `result`, and dsh 0.1.5 carries a `schema` instead.
    const codec = descriptor.result?.spec ?? descriptor.result;
    const schema = typeof codec?.create === 'function'
      ? codec.create()
      : (typeof codec?.schema === 'function' ? codec.schema() : codec?.schema);
    return typeof schema?.parse === 'function' ? schema : undefined;
  };
  // A host that publishes no live result schema leaves reply shapes unchecked
  // here; the suites report that rather than counting it as verified.
  const resultSchemasPublished = resultSchema('session/list') !== undefined;
  const validate = (endpoint, value) => {
    const schema = resultSchema(endpoint);
    if (schema === undefined) return value;
    try {
      schema.parse(value);
    } catch (error) {
      assert.fail(`${endpoint}: this reply is not the shape the host promises: ${
        error.message.slice(0, 400)}`);
    }
    return value;
  };

  for (const [serviceKey, receiver] of Object.entries(receivers)) {
    const namespace = [...descriptors.values()]
      .find((descriptor) => descriptor.service === serviceKey)?.namespace;
    assert.ok(namespace, `this host declares no namespace served by ${serviceKey}`);
    // Every scripted reply is checked against the descriptor's own generated
    // result schema, so a fixture can only answer with something the host
    // itself promises to return -- including each frame of a stream method.
    for (const method of Object.keys(receiver)) {
      const endpoint = `${namespace}/${method}`;
      if (!descriptors.has(endpoint)) continue;
      const implementation = receiver[method];
      receiver[method] = descriptors.get(endpoint).mode === 'stream'
        ? async function* validatedStream(...args) {
          for await (const frame of implementation.apply(this, args)) yield validate(endpoint, frame);
        }
        : async function validated(...args) {
          return validate(endpoint, await implementation.apply(this, args));
        };
    }
    // The gateway validates that the receiver advertises the binding the
    // descriptor was generated for, so the scripted controller carries one.
    receiver.typertRemote = { service: receiver, serviceKey, namespace };
    app.provide(serviceKey, undefined, true);
    app.set(serviceKey, receiver);
  }

  if (withConnection) {
    // Publish the connection surface this host actually has, so the bridge's
    // own capability probe decides: dsh 0.2.1 exports the `Peer` class its
    // `createPeer` factory builds, while dsh 0.2.0 has no factory and publishes
    // a ready-made `connection.operator` instead.
    app.provide('connection', undefined, true);
    app.set('connection', typeof connection.Peer === 'function'
      ? { createPeer: (options) => new connection.Peer(app, options) }
      : { operator: operatorPeerShape(app) });
  }

  return { app, descriptors, validateResult: validate, resultSchemasPublished };
}
