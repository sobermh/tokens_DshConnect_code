import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { modernHarnessApi } from '../../plugin-src/host/modern-harness-api.mjs';

// The HOST-LIVE probe: a Cordis plugin the live-host fixture inserts into a
// real, fully booted Host so the bridge can be exercised against the Host's own
// running services.
//
// The scripted HOST-RPC fixture answers every controller method itself. That
// cannot see a Host whose *services* refuse the call before a controller runs:
// dsh 0.2.1's gateway reads `peer.signal` in `prepareInvocation`, so the whole
// bridge died there on four product releases while 3000+ mocked cases stayed
// green. Here the Workspace registry, the Workspace and Session controllers,
// the Connection service that mints the Peer, the remote-access policy and the
// gateway are all the real ones, and nothing between this plugin and the Host's
// business layer is scripted.
//
// Everything this plugin reports is data: the fixture asserts, the probe only
// records. A step that throws is recorded with its raw error -- the one the
// bridge's `rpcResult` would otherwise flatten into `code: 'internal'`.

export const name = 'dsh-connect-live-probe';
export const inject = ['connection', 'typertGateway'];

const REPORT = process.env.DSH_LIVE_PROBE_REPORT;
/** Milliseconds the probe waits for the Host's own controllers to come up. */
const READY_TIMEOUT_MS = 30_000;

function describe(error, depth = 0) {
  if (typeof error !== 'object' || error === null) {
    return { name: typeof error, message: String(error) };
  }
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    isDSHRemoteError: error.isDSHRemoteError === true,
    details: error.details,
    endpoint: error.endpoint,
    stack: typeof error.stack === 'string' ? error.stack.split('\n').slice(0, 12) : undefined,
    ...(error.cause !== undefined && depth < 3 ? { cause: describe(error.cause, depth + 1) } : {}),
  };
}

async function step(steps, id, run) {
  try {
    steps.push({ id, ok: true, value: await run() });
  } catch (error) {
    steps.push({ id, ok: false, error: describe(error) });
  }
  return steps.at(-1);
}

/** Unwrap one bridge reply the way a channel's HarnessClient does. */
function reply(response) {
  if (response?.result?.ok !== true) {
    const failure = response?.result?.error;
    const error = new Error(`bridge call failed: ${failure?.code}: ${failure?.message}`);
    error.code = failure?.code;
    error.details = failure?.details;
    throw error;
  }
  return response.result.value;
}

function workspaceDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-connect-live-'));
  writeFileSync(join(directory, 'README.md'), '# dsh-connect live host contract\n');
  return directory;
}

/**
 * Call every Harness endpoint the bridge owns against the live Host.
 *
 * @param ctx - the activation Context, the one `dsh-im` builds its bridge on.
 * @returns one record per case, in execution order.
 */
async function run(ctx) {
  const steps = [];
  const connection = ctx.connection;

  await step(steps, 'surface', async () => ({
    hasConnection: connection !== undefined && connection !== null,
    // The two Peer sources the bridge probes for, in its own order.
    hasCreatePeer: typeof connection?.createPeer === 'function',
    hasOperator: connection?.operator !== undefined && connection?.operator !== null,
    hasGatewayInvoke: typeof ctx.typertGateway?.invoke === 'function',
    hasGatewayStream: typeof ctx.typertGateway?.stream === 'function',
  }));

  const api = modernHarnessApi(ctx);
  let workspaceId;
  let sessionId;
  const path = workspaceDirectory();

  const baseline = await step(steps, 'workspace.list', async () => {
    const value = reply(await api.workspace.list({ rpcId: 'live-workspace-list', payload: {} }));
    return {
      items: value.items.length,
      paths: value.items.map((item) => item.path),
      hasArchived: Array.isArray(value.archivedSessionIds),
      hasPinned: Array.isArray(value.pinnedSessionIds),
    };
  });

  await step(steps, 'workspace.create', async () => {
    const value = reply(await api.workspace.create({
      rpcId: 'live-workspace-create', payload: { path },
    }));
    workspaceId = value.workspace.workspaceId;
    return { workspaceId, path: value.workspace.path, created: value.created };
  });

  await step(steps, 'workspace.list after create', async () => {
    const value = reply(await api.workspace.list({ rpcId: 'live-workspace-relist', payload: {} }));
    return {
      items: value.items.length,
      grew: value.items.length === (baseline.value?.items ?? -1) + 1,
      containsCreated: value.items.some((item) => item.workspaceId === workspaceId),
    };
  });

  await step(steps, 'sessions.list', async () => {
    const value = reply(await api.sessions.list({ rpcId: 'live-session-list', payload: {} }));
    return { items: value.items.length };
  });

  await step(steps, 'sessions.create', async () => {
    const value = reply(await api.sessions.create({
      rpcId: 'live-session-create', payload: { workspaceId },
    }));
    sessionId = value.sessionId;
    return { hasSessionId: typeof value.sessionId === 'string' && value.sessionId.length > 0 };
  });

  await step(steps, 'sessions.history', async () => {
    const value = reply(await api.sessions.history({
      rpcId: 'live-session-history', payload: { sessionId },
    }));
    return { events: value.events.length, hasMore: value.hasMore };
  });

  await step(steps, 'sessions.rename', async () => {
    const value = reply(await api.sessions.rename({
      rpcId: 'live-session-rename', payload: { sessionId, title: '连接中心实宿主契约' },
    }));
    const listed = reply(await api.sessions.list({ rpcId: 'live-session-relist', payload: {} }));
    const entry = listed.items.find((item) => item.sessionId === sessionId);
    return {
      title: value.title,
      seq: value.seq,
      // A Session nobody has prompted has nothing persisted yet, so this Host
      // does not list it; when it is listed, the new title must be there.
      listed: entry !== undefined,
      // The title a channel shows comes from this projection, not a `title`
      // field on the summary; reading the wrong one is a silent blank name.
      listedTitle: entry?.projections?.values?.title,
    };
  });

  await step(steps, 'sessions.cancel', async () => {
    const value = reply(await api.sessions.cancel({
      rpcId: 'live-session-cancel', payload: { sessionId },
    }));
    return { accepted: value.accepted };
  });

  await step(steps, 'llm.models', async () => {
    const value = reply(await api.llm.models({ rpcId: 'live-llm-models', payload: {} }));
    return {
      groups: value.groups.length,
      hasFailures: value.failures === undefined ? false : Array.isArray(value.failures),
    };
  });

  await step(steps, 'sessions.models', async () => {
    const value = reply(await api.sessions.models({
      rpcId: 'live-session-models', payload: { sessionId },
    }));
    return { groups: value.groups.length, routable: value.routable };
  });

  // The control: the same live gateway, called the way 2.9.6 called it. On a
  // Host that requires a Peer this must fail, which is what makes every case
  // above evidence rather than coincidence.
  await step(steps, 'control: no Peer', async () => {
    const controller = new AbortController();
    let iterator;
    try {
      const source = await ctx.typertGateway.stream({
        namespace: 'workspace', method: 'follow', args: {}, signal: controller.signal,
      });
      iterator = source[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { accepted: true, type: first.value?.type };
    } finally {
      controller.abort(new DOMException('control finished', 'AbortError'));
      await Promise.resolve(iterator?.return?.()).catch(() => undefined);
    }
  });

  return steps;
}

function finish(report) {
  const text = JSON.stringify(report, null, 2);
  if (REPORT) {
    try {
      writeFileSync(REPORT, text);
    } catch {
      process.stdout.write(`DSH-LIVE-PROBE ${text}\n`);
    }
  }
  // The Host owns this process; the fixture reads the report after it exits.
  setTimeout(() => process.exit(0), 100).unref?.();
}

export function apply(ctx) {
  // The bridge is built on the Context `dsh-im` activates its channels in:
  // `ctx.inject(['sessionController', 'workspaceController'], activate)`. That
  // Context, not the plugin root, is where `hostPeer` looks for `connection`,
  // so the probe reproduces it exactly.
  const timer = setTimeout(
    () => finish({ booted: true, steps: [], fatal: 'the Host controllers never became ready' }),
    READY_TIMEOUT_MS,
  );
  timer.unref?.();
  ctx.inject(['sessionController', 'workspaceController'], (readyCtx) => {
    clearTimeout(timer);
    run(readyCtx).then(
      (steps) => finish({ booted: true, steps }),
      (error) => finish({ booted: true, steps: [], fatal: describe(error) }),
    );
  });
}
