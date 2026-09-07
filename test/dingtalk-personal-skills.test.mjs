import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readZipEntries } from '../plugin-src/host/connectors/dingtalk-personal/archive.js';
import {
  ensureDwsSkills,
  inspectDwsSkills,
  installDwsSkillsArchive,
} from '../plugin-src/host/connectors/dingtalk-personal/skills-provision.js';

function storedZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

test('DWS ZIP reader rejects path traversal before extraction', () => {
  const archive = storedZip([['multi/dingtalk-shared/../../escape.txt', 'nope']]);
  assert.throws(() => readZipEntries(archive), /unsafe entry path/);
});

test('DWS Skills preserve unmanaged same-name directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dws-skills-test-'));
  try {
    await mkdir(join(root, 'dingtalk-chat'), { recursive: true });
    await writeFile(join(root, 'dingtalk-chat', 'SKILL.md'), 'custom skill\n');
    const archive = storedZip([
      ['multi/dingtalk-shared/SKILL.md', '# shared\n'],
      ['multi/dingtalk-chat/SKILL.md', '# official chat\n'],
      ['multi/dingtalk-chat/references/chat.md', '# chat docs\n'],
    ]);

    const result = await installDwsSkillsArchive(archive, { root, version: 'v1.0.61' });
    assert.deepEqual(result.names, ['dingtalk-shared']);
    assert.deepEqual(result.collisions, ['dingtalk-chat']);
    assert.equal(await readFile(join(root, 'dingtalk-chat', 'SKILL.md'), 'utf8'), 'custom skill\n');
    assert.equal(await readFile(join(root, 'dingtalk-shared', 'SKILL.md'), 'utf8'), '# shared\n');

    const status = await inspectDwsSkills(root);
    assert.equal(status.available, true);
    assert.equal(status.count, 1);
    assert.deepEqual(status.collisions, ['dingtalk-chat']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('DWS Skills can replace only directories carrying their ownership marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dws-skills-update-'));
  try {
    await installDwsSkillsArchive(storedZip([
      ['multi/dingtalk-shared/SKILL.md', '# old\n'],
    ]), { root, version: 'v1.0.61' });
    await installDwsSkillsArchive(storedZip([
      ['multi/dingtalk-shared/SKILL.md', '# new\n'],
    ]), { root, version: 'v1.0.62' });
    assert.equal(await readFile(join(root, 'dingtalk-shared', 'SKILL.md'), 'utf8'), '# new\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('forced DWS Skills refresh runs again after an earlier request completes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dws-skills-refresh-'));
  const previousHome = process.env.DSH_HOME;
  const previousFetch = globalThis.fetch;
  const archive = storedZip([
    ['multi/dingtalk-shared/SKILL.md', '# shared\n'],
  ]);
  const digest = createHash('sha256').update(archive).digest('hex');
  let archiveFetches = 0;
  process.env.DSH_HOME = home;
  globalThis.fetch = async (url) => {
    const href = String(url);
    let body;
    if (href.endsWith('/releases/latest')) {
      body = Buffer.from(JSON.stringify({
        tag_name: 'v1.0.61',
        assets: [
          { name: 'checksums.txt', browser_download_url: 'https://github.com/checksums.txt' },
          { name: 'dws-skills.zip', browser_download_url: 'https://github.com/dws-skills.zip' },
        ],
      }));
    } else if (href.endsWith('/checksums.txt')) {
      body = Buffer.from(`${digest}  dws-skills.zip\n`);
    } else if (href.endsWith('/dws-skills.zip')) {
      archiveFetches += 1;
      body = archive;
    } else {
      throw new Error(`unexpected fetch: ${href}`);
    }
    return {
      ok: true,
      url: href,
      arrayBuffer: async () => body,
    };
  };

  try {
    await ensureDwsSkills(true);
    await ensureDwsSkills(true);
    assert.equal(archiveFetches, 2);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    globalThis.fetch = previousFetch;
    await rm(home, { recursive: true, force: true });
  }
});
