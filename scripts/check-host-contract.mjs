import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { TOOL_DISPATCH_START_EVENT_TYPES } from '../src/channels/shared/harness-client.mjs';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

if (!process.env.DSH_HOST_ROOT) throw new Error('Set DSH_HOST_ROOT to the installed host root');
const hostRequire = createRequire(resolve(process.env.DSH_HOST_ROOT, 'package.json'));
const load = async name => {
  const entry = hostRequire.resolve(name);
  const manifest = JSON.parse(await readFile(hostRequire.resolve(`${name}/package.json`), 'utf8'));
  return { api: await import(pathToFileURL(entry).href), version: manifest.version };
};
const tools = await load('@deepseek-ai/dsh-tools');
const credentials = await load('@deepseek-ai/dsh-credentials');
const session = await load('@deepseek-ai/dsh-session');
// Harness renamed the run_code sub-dispatch announcement in dsh 0.1.5. Reading
// a name this host never writes is silent: approvals raised inside run_code
// just lose their tool context. Check the name against the host's own event
// vocabulary instead of a fixture.
const hostEventTypes = session.api.KNOWN_SESSION_EVENT_TYPES;
let dispatchReport = 'dispatch vocabulary not published by this host';
if (hostEventTypes !== undefined) {
  assert.ok(hostEventTypes instanceof Set, 'KNOWN_SESSION_EVENT_TYPES must be a Set');
  const recognized = [...TOOL_DISPATCH_START_EVENT_TYPES].filter((type) => hostEventTypes.has(type));
  assert.ok(
    recognized.length > 0,
    `this host writes no run_code sub-dispatch event the client reads; host has ${
      [...hostEventTypes].filter((type) => type.includes('dispatch')).join(', ') || 'none'
    }, client reads ${[...TOOL_DISPATCH_START_EVENT_TYPES].join(', ')}`,
  );
  dispatchReport = `reads ${recognized.join(', ')}`;
}
// dsh 0.2 disables a plugin whose `peerDependencies` do not admit the running
// dsh version, and says so only on Desktop's stderr. Ask this host's own
// evaluator rather than re-implementing its semver policy here. dsh 0.1 ships
// no evaluator, so its absence is reported, not treated as a pass.
let compatibilityReport = 'no compatibility evaluator on this host';
const appBoot = await load('@deepseek-ai/dsh-app-boot').catch(() => undefined);
if (typeof appBoot?.api?.evaluatePluginCompatibility === 'function') {
  const { evaluatePluginCompatibility } = appBoot.api;
  const runtimeVersion = appBoot.version;
  // A verdict names its unmet map `requirements` on dsh 0.2.1 and `peers` on
  // 0.2.0. Read whichever this host publishes and refuse an unrecognized
  // shape: reading a field no host writes makes every refusal below look like
  // an acceptance, which is how a rename passes as a clean run.
  const unmetOf = (verdict) => {
    if (verdict === undefined) return undefined;
    const unmet = verdict.requirements ?? verdict.peers;
    assert.ok(
      unmet !== null && typeof unmet === 'object',
      `dsh ${runtimeVersion} reports an incompatibility in neither \`requirements\` nor \`peers\`: ${
        JSON.stringify(verdict)}`,
    );
    return unmet;
  };
  const verdict = evaluatePluginCompatibility(manifest, {}, runtimeVersion);
  assert.equal(
    verdict,
    undefined,
    `this host would disable the plugin: ${JSON.stringify(unmetOf(verdict))} unsatisfied by dsh ${runtimeVersion}`,
  );
  // A passing verdict is also what a manifest with no peers at all returns, so
  // prove the declaration is actually read: a caret floor must be refused here.
  const caretFloor = Object.fromEntries(
    Object.keys(manifest.peerDependencies).map((name) => [name, '^0.1.0']),
  );
  const refused = unmetOf(
    evaluatePluginCompatibility({ ...manifest, peerDependencies: caretFloor }, {}, runtimeVersion),
  );
  if (runtimeVersion.startsWith('0.2.')) {
    assert.ok(refused, `this host accepted ^0.1.0 on dsh ${runtimeVersion}; the gate is not reading peers`);
  }
  // dsh 0.2.1 checks an own `engines.dsh` range first and then ignores the dsh
  // peers entirely, while 0.2.0 ignores `engines.dsh`. Declaring one would
  // silently void the peer range on a 0.2.1 host, so this manifest must not
  // carry it -- test/host-peer-range.test.mjs guards that without a host.
  // Report which rule this host follows instead of inferring it from a version.
  const enginesFloor = { ...manifest, engines: { ...manifest.engines, dsh: '^0.1.0' } };
  const enginesUnmet = unmetOf(evaluatePluginCompatibility(enginesFloor, {}, runtimeVersion));
  compatibilityReport = `peers accepted by dsh ${runtimeVersion}${refused ? ', ^0.1.0 refused' : ''}, ${
    enginesUnmet ? `engines.dsh decides alone (${Object.keys(enginesUnmet).join(', ')})` : 'engines.dsh ignored'}`;
}

assert.equal(typeof tools.api.defineTool, 'function');
assert.equal(typeof credentials.api.credentialRef, 'function');
assert.equal(credentials.api.credentialRef('DSH_CONNECT_CONTRACT_REF'), 'DSH_CONNECT_CONTRACT_REF');
assert.throws(() => credentials.api.credentialRef('invalid reference'));
const tool = tools.api.defineTool({
  name: 'dsh_connect_contract_probe', description: 'Local in-memory API probe',
  parameters: { value: { type: 'string', required: true } },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  async execute(args) { return args.value; },
});
assert.equal(tool.parameters.type, 'object');
assert.equal(tool.output.schema.type, 'string');
const value = await tool.execute({ value: 'contract-ok' }, { signal: new AbortController().signal });
assert.equal(value, 'contract-ok');
assert.deepEqual(tool.output.render({}, value), [{ type: 'text', text: 'contract-ok' }]);
await assert.rejects(tool.execute({ value: 42 }, { signal: new AbortController().signal }));
console.log(`Host API contract passed: dsh-tools ${tools.version}, dsh-credentials ${
  credentials.version}, dsh-session ${session.version} (${dispatchReport}; ${compatibilityReport})`);
