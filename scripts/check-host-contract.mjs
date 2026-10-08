import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.DSH_HOST_ROOT) throw new Error('Set DSH_HOST_ROOT to the installed host root');
const hostRequire = createRequire(resolve(process.env.DSH_HOST_ROOT, 'package.json'));
const load = async name => {
  const entry = hostRequire.resolve(name);
  const manifest = JSON.parse(await readFile(hostRequire.resolve(`${name}/package.json`), 'utf8'));
  return { api: await import(pathToFileURL(entry).href), version: manifest.version };
};
const tools = await load('@deepseek-ai/dsh-tools');
const credentials = await load('@deepseek-ai/dsh-credentials');
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
console.log(`Host API contract passed: dsh-tools ${tools.version}, dsh-credentials ${credentials.version}`);
