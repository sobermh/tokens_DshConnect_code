import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as tar from 'tar';
import { validateRelease } from './validate-release.mjs';

export async function verifyTarball(filename, expected) {
  const contents = new Map();
  const invalid = [];
  await tar.t({ file: filename, onReadEntry(entry) {
    if (entry.type === 'Directory') { entry.resume(); return; }
    if (!['File', 'OldFile'].includes(entry.type)) { invalid.push(`Unsupported entry: ${entry.path}`); entry.resume(); return; }
    const chunks = [];
    entry.on('data', chunk => chunks.push(chunk));
    entry.on('end', () => {
      if (contents.has(entry.path)) invalid.push(`Duplicate entry: ${entry.path}`);
      contents.set(entry.path, Buffer.concat(chunks));
    });
  } });
  assert.deepEqual(invalid, [], 'Tarball must not contain links or duplicate entries');
  for (const name of contents.keys()) {
    assert.ok(/^package\/(?:assets\/[a-zA-Z0-9_-]+\.(?:png|svg|webp)|bin\/[a-zA-Z0-9_-]+\.mjs|lib\/[a-zA-Z0-9_-]+\.js|docs\/(?:README\.en-US\.md|host-compatibility\.md|images\/[a-zA-Z0-9_-]+\.(?:png|jpg))|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|cordis\.patch\.yml|package\.json)$/.test(name), `Unexpected packaged path: ${name}`);
  }
  assert.ok(contents.has('package/package.json'), 'Missing package manifest');
  const manifest = JSON.parse(contents.get('package/package.json'));
  validateRelease(manifest, `v${expected.version}`);
  assert.equal(manifest.version, expected.version);
  assert.equal(manifest.main, expected.main);
  assert.deepEqual(manifest.exports, expected.exports);
  assert.deepEqual(manifest.bin, expected.bin);
  assert.equal(manifest.dsh.bundle.patch, expected.dsh.bundle.patch);
  for (const entry of [manifest.main, manifest.exports['./client'], ...Object.values(manifest.bin), manifest.dsh.bundle.patch, 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/README.en-US.md', 'docs/host-compatibility.md', 'assets/logo.png', 'docs/images/imbot.png']) {
    assert.ok(contents.has(`package/${entry.replace(/^\.\//, '')}`), `Missing packaged resource: ${entry}`);
  }
  console.log(`Verified tarball ${manifest.name}@${manifest.version}: ${contents.size} files`);
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyTarball(process.argv[2], JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')));
}
