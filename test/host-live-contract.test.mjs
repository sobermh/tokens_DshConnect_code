import assert from 'node:assert/strict';
import test from 'node:test';

import { gatewayRequiresPeer, hostVersion } from './support/real-host-gateway.mjs';
import { SKIP_WITHOUT_LIVE_HOST, liveHostReport, liveStep, liveValue } from './support/live-host.mjs';

// HOST-LIVE: the bridge against a Host that is actually running.
//
// HOST-RPC already calls all eleven endpoints over the installed gateway and
// its generated descriptors, but it answers every controller itself. That
// leaves one class of break invisible: a Host whose *services* refuse the call
// before any controller runs. dsh 0.2.1 did exactly that -- its gateway reads
// `peer.signal` in `prepareInvocation` -- and every channel failed on
// `workspace.list` through four product releases while the mocked suites
// stayed green (T0047).
//
// So these cases boot the installed Host with its own launcher and run the
// bridge inside it: the real Workspace registry, the real Workspace and
// Session controllers, the real Connection service minting the Peer, the real
// remote-access policy, the real gateway. Nothing is scripted. The bridge is
// built on the Context `dsh-im` activates its channels in, because that -- not
// the plugin root -- is where `hostPeer` looks for `connection`.
//
// Run against a real install (one leg per staged host):
//   DSH_HOST_ROOT=<...>/dsh-plugin-desktop npm run check:host
// Without DSH_HOST_ROOT these cases are reported as not executed, never passed.
const skip = SKIP_WITHOUT_LIVE_HOST;

test('HOST-LIVE-01 the live Host offers this bridge a Peer source', { skip }, async () => {
  const report = await liveHostReport();
  const surface = liveValue(report, 'surface');
  assert.equal(surface.hasConnection, true, 'the live Host published no connection service');
  assert.equal(surface.hasGatewayInvoke, true);
  assert.equal(surface.hasGatewayStream, true);
  // dsh 0.2.1 mints one through `createPeer`; dsh 0.2.0 publishes a ready-made
  // `connection.operator`; dsh 0.1.5 has neither and asks for no Peer. A Host
  // that demands one and offers no way to build it is the failure this suite
  // exists to catch, so the requirement follows the gateway's own declaration.
  if (gatewayRequiresPeer()) {
    assert.ok(
      surface.hasCreatePeer || surface.hasOperator,
      `dsh ${hostVersion('@deepseek-ai/dsh-api-gateway')} requires a Peer and offers neither connection.createPeer nor connection.operator`,
    );
  }
});

test('HOST-LIVE-02 workspace.list reads a baseline off the live registry', { skip }, async () => {
  const report = await liveHostReport();
  const value = liveValue(report, 'workspace.list');
  assert.equal(typeof value.items, 'number');
  // The channel client refuses a baseline without this array, so a Host that
  // stopped sending it would break every inbound message.
  assert.equal(value.hasArchived, true, 'the baseline carried no archivedSessionIds');
  // `pinnedSessionIds` arrived in dsh 0.2 and nothing here reads it, so it is
  // recorded rather than required.
});

test('HOST-LIVE-03 workspace.create registers a real directory', { skip }, async () => {
  const report = await liveHostReport();
  const value = liveValue(report, 'workspace.create');
  assert.equal(typeof value.workspaceId, 'string');
  assert.ok(value.workspaceId.length > 0, 'the live Host minted no workspace id');
  assert.equal(value.created, true);
});

test('HOST-LIVE-04 the next workspace.list carries that workspace', { skip }, async () => {
  const report = await liveHostReport();
  const value = liveValue(report, 'workspace.list after create');
  assert.equal(value.containsCreated, true, 'the live baseline never caught up with the create');
  assert.equal(value.grew, true, 'the baseline did not grow by exactly the created workspace');
});

test('HOST-LIVE-05 sessions.list reads the live Session controller', { skip }, async () => {
  const report = await liveHostReport();
  assert.equal(typeof liveValue(report, 'sessions.list').items, 'number');
});

test('HOST-LIVE-06 sessions.create opens a Session in that Workspace', { skip }, async () => {
  const report = await liveHostReport();
  assert.equal(liveValue(report, 'sessions.create').hasSessionId, true);
});

test('HOST-LIVE-07 sessions.history reads the live follow snapshot', { skip }, async () => {
  const report = await liveHostReport();
  const value = liveValue(report, 'sessions.history');
  // A Session nobody has prompted has no events yet; what this case proves is
  // that the bridge opens `session/follow`, takes the snapshot frame and reads
  // its cursor, which is where a changed stream contract would break.
  assert.equal(typeof value.events, 'number');
  assert.equal(value.hasMore, false);
});

test('HOST-LIVE-08 sessions.rename retitles a live Session', { skip }, async () => {
  const report = await liveHostReport();
  const value = liveValue(report, 'sessions.rename');
  assert.equal(value.title, '连接中心实宿主契约');
  assert.equal(typeof value.seq, 'number', 'the live controller returned no rename seq');
  // `session/list` reads persisted Sessions, and a Session nobody has prompted
  // has nothing persisted; the cross-check only applies once it is listed.
  if (value.listed) assert.equal(value.listedTitle, '连接中心实宿主契约');
});

test('HOST-LIVE-09 sessions.cancel is accepted by the live controller', { skip }, async () => {
  const report = await liveHostReport();
  assert.equal(liveValue(report, 'sessions.cancel').accepted, true);
});

test('HOST-LIVE-10 the live model catalog answers both model calls', { skip }, async () => {
  const report = await liveHostReport();
  // The catalog's contents depend on the deployment's providers and its
  // credentials, so these cases read its shape, not its models.
  assert.equal(typeof liveValue(report, 'llm.models').groups, 'number');
  assert.equal(typeof liveValue(report, 'sessions.models').groups, 'number');
});

test('HOST-LIVE-11 a call that names no Peer is what this Host refuses', { skip }, async () => {
  const report = await liveHostReport();
  const control = liveStep(report, 'control: no Peer');
  if (!gatewayRequiresPeer()) {
    assert.equal(
      control.ok,
      true,
      `dsh ${hostVersion('@deepseek-ai/dsh-api-gateway')} declares peer optional, so this call must still succeed`,
    );
    return;
  }
  // Without this, every case above could be passing for an unrelated reason:
  // it pins the 2.9.6 failure in place on the Host that introduced it.
  assert.equal(control.ok, false, 'this Host requires a Peer, yet a call without one succeeded');
  assert.match(control.error.message, /signal/u);
  assert.equal(
    control.error.isDSHRemoteError,
    false,
    'a raw TypeError is why the channels only ever saw code: internal',
  );
});
