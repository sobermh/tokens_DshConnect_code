import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import * as tar from 'tar';
import { verifyTarball } from '../scripts/verify-tarball.mjs';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
test('actual tarball validation rejects omitted entries, credentials and wrong identity', async t => {
  for (const mode of ['valid', 'missing-client', 'missing-cli', 'credential', 'wrong-identity']) {
    await t.test(mode, async () => {
      const root = await mkdtemp(join(tmpdir(), 'dsh-connect-pack-'));
      try {
        const entries = ['lib/index.js', 'lib/client.js', 'bin/dsh-connect.mjs', 'cordis.patch.yml', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'docs/README.en-US.md', 'docs/host-compatibility.md', 'assets/logo.png', 'docs/images/imbot.png'];
        if (mode === 'missing-client') entries.splice(entries.indexOf('lib/client.js'), 1);
        if (mode === 'missing-cli') entries.splice(entries.indexOf('bin/dsh-connect.mjs'), 1);
        if (mode === 'credential') entries.push('assets/.npmrc');
        for (const path of entries) {
          const target = join(root, 'package', path);
          await mkdir(dirname(target), { recursive: true }); await writeFile(target, 'fixture');
        }
        await writeFile(join(root, 'package/package.json'), JSON.stringify({ ...manifest, ...(mode === 'wrong-identity' ? { name: '@other/plugin' } : {}) }));
        const filename = join(root, 'fixture.tgz');
        await tar.c({ gzip: true, file: filename, cwd: root }, ['package']);
        if (mode === 'valid') assert.equal((await verifyTarball(filename, manifest)).version, manifest.version);
        else await assert.rejects(verifyTarball(filename, manifest));
      } finally { await rm(root, { recursive: true, force: true }); }
    });
  }
});
