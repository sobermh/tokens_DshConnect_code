import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { arch, homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { readZipEntries } from './archive.js';

const REPOSITORY = 'DingTalk-Real-AI/dingtalk-workspace-cli';
const GITHUB_API = 'https://api.github.com';
const GITHUB_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
const MIN_VERSION = '1.0.61';
const MAX_METADATA_SIZE = 4 * 1024 * 1024;
const MAX_ARCHIVE_SIZE = 64 * 1024 * 1024;
const MAX_BINARY_SIZE = 128 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export function resolveDshHome(env = process.env, userHome = homedir()) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : '';
  return configured === '' ? join(userHome, '.dsh') : resolve(configured);
}

export function dwsRuntimeDir() {
  return join(resolveDshHome(), 'runtime', 'dws');
}

export function dwsConfigDir() {
  return join(dwsRuntimeDir(), 'config');
}

function versionStamp() {
  return join(dwsRuntimeDir(), '.dws-version');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function compareVersions(left, right) {
  const parse = (value) => value.replace(/^v/, '').split(/[.\-+]/).slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

function platformInfo() {
  const os = platform() === 'win32' ? 'windows'
    : platform() === 'darwin' ? 'darwin'
      : platform() === 'linux' ? 'linux' : undefined;
  const cpu = arch() === 'x64' ? 'amd64' : arch() === 'arm64' ? 'arm64' : undefined;
  if (os === undefined || cpu === undefined) {
    throw new Error(`dws: unsupported platform (${platform()}-${arch()})`);
  }
  return {
    os,
    cpu,
    format: os === 'windows' ? 'zip' : 'tar.gz',
    entry: os === 'windows' ? 'dws.exe' : 'dws',
  };
}

function assetName(info) {
  return `dws-${info.os}-${info.cpu}.${info.format}`;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function httpBytes(url, maxBytes) {
  const initial = new URL(url);
  if (initial.protocol !== 'https:' || !GITHUB_HOSTS.has(initial.hostname)) {
    throw new Error('dws: refusing to fetch from an untrusted URL');
  }
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      accept: 'application/octet-stream, application/vnd.github+json',
      'user-agent': 'tokens-dsh-connect-dws/1',
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`dws: fetch failed (HTTP ${response.status})`);
  const finalUrl = new URL(response.url || url);
  if (finalUrl.protocol !== 'https:' || !GITHUB_HOSTS.has(finalUrl.hostname)) {
    throw new Error('dws: fetch redirected to an untrusted host');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('dws: fetched resource is too large');
  return bytes;
}

let releaseInFlight;
async function fetchLatestRelease() {
  const metadata = JSON.parse((await httpBytes(
    `${GITHUB_API}/repos/${REPOSITORY}/releases/latest`,
    MAX_METADATA_SIZE,
  )).toString('utf8'));
  const rawTag = typeof metadata.tag_name === 'string' ? metadata.tag_name : '';
  if (!/^v?\d+\.\d+\.\d+$/.test(rawTag)) throw new Error('dws: invalid latest release tag');
  if (compareVersions(rawTag, MIN_VERSION) < 0) {
    throw new Error(`dws: latest release ${rawTag} is below supported ${MIN_VERSION}`);
  }
  const assets = new Map();
  for (const asset of Array.isArray(metadata.assets) ? metadata.assets : []) {
    if (typeof asset?.name === 'string' && typeof asset?.browser_download_url === 'string') {
      assets.set(asset.name, asset.browser_download_url);
    }
  }
  return { tag: rawTag.startsWith('v') ? rawTag : `v${rawTag}`, assets };
}

export function resolveDwsRelease() {
  if (releaseInFlight === undefined) {
    releaseInFlight = fetchLatestRelease().catch((error) => {
      releaseInFlight = undefined;
      throw error;
    });
  }
  return releaseInFlight;
}

export function checksumFor(manifest, name) {
  for (const line of manifest.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (match?.[2]?.trim() === name) return match[1].toLowerCase();
  }
  throw new Error(`dws: ${name} is not listed in checksums.txt`);
}

export async function downloadVerifiedDwsAsset(release, name, maxBytes = MAX_ARCHIVE_SIZE) {
  const assetUrl = release.assets.get(name);
  const checksumsUrl = release.assets.get('checksums.txt');
  if (assetUrl === undefined) throw new Error(`dws: release ${release.tag} has no ${name}`);
  if (checksumsUrl === undefined) throw new Error(`dws: release ${release.tag} has no checksums.txt`);
  const manifest = (await httpBytes(checksumsUrl, MAX_METADATA_SIZE)).toString('utf8');
  const expected = checksumFor(manifest, name);
  const archive = await httpBytes(assetUrl, maxBytes);
  if (sha256(archive) !== expected) throw new Error(`dws: checksum mismatch for ${name}`);
  return archive;
}

function extractTarEntry(archive, entryName) {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_BINARY_SIZE * 2 });
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const field = tar.subarray(offset, offset + 100);
    const nul = field.indexOf(0);
    const name = field.toString('utf8', 0, nul < 0 ? field.length : nul);
    if (name === '') break;
    const sizeText = tar.toString('ascii', offset + 124, offset + 136).replace(/\0.*$/, '').trim();
    const size = sizeText === '' ? 0 : Number.parseInt(sizeText, 8);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BINARY_SIZE) {
      throw new Error('dws: invalid tar entry size');
    }
    const type = tar.toString('ascii', offset + 156, offset + 157);
    const dataOffset = offset + 512;
    if ((type === '' || type === '\0' || type === '0')
      && (name === entryName || name === `./${entryName}`)) {
      return Buffer.from(tar.subarray(dataOffset, dataOffset + size));
    }
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }
  throw new Error(`dws: ${entryName} not found in tar.gz`);
}

function extractBinary(archive, info) {
  if (info.format === 'zip') {
    const entries = readZipEntries(archive, {
      select: (name) => name === info.entry,
      maxEntrySize: MAX_BINARY_SIZE,
      maxTotalSize: MAX_BINARY_SIZE,
    });
    if (entries.length !== 1) throw new Error(`dws: ${info.entry} not found in zip`);
    return entries[0].data;
  }
  return extractTarEntry(archive, info.entry);
}

async function replaceFile(staging, target) {
  const backup = `${target}.${process.pid}.old`;
  const existed = await isFile(target);
  if (existed) await rename(target, backup);
  try {
    await rename(staging, target);
    if (existed) await rm(backup, { force: true });
  } catch (error) {
    if (existed) await rename(backup, target).catch(() => {});
    throw error;
  }
}

async function installedTag() {
  try {
    return (await readFile(versionStamp(), 'utf8')).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function installBinary(info, release, target) {
  const name = assetName(info);
  const archive = await downloadVerifiedDwsAsset(release, name);
  const binary = extractBinary(archive, info);
  if (binary.length > MAX_BINARY_SIZE) throw new Error('dws: extracted binary is too large');
  const staging = join(dwsRuntimeDir(), `.dws-${process.pid}-${Date.now()}.part`);
  await writeFile(staging, binary, { mode: 0o700 });
  try {
    await replaceFile(staging, target);
  } finally {
    await rm(staging, { force: true }).catch(() => {});
  }
  await chmod(target, 0o700).catch(() => {});
  await writeFile(versionStamp(), `${release.tag}\n`, { mode: 0o600 });
  return target;
}

let ensureInFlight;
async function ensureDwsImpl() {
  const info = platformInfo();
  await mkdir(dwsRuntimeDir(), { recursive: true });
  await mkdir(dwsConfigDir(), { recursive: true });
  const target = join(dwsRuntimeDir(), info.entry);
  let release;
  try {
    release = await resolveDwsRelease();
  } catch (error) {
    if (await isFile(target)) return target;
    throw error;
  }
  if (await isFile(target) && await installedTag() === release.tag) return target;
  return installBinary(info, release, target);
}

export function ensureDws() {
  if (ensureInFlight === undefined) {
    ensureInFlight = ensureDwsImpl().catch((error) => {
      ensureInFlight = undefined;
      throw error;
    });
  }
  return ensureInFlight;
}

export async function dwsPath() {
  let info;
  try {
    info = platformInfo();
  } catch {
    return undefined;
  }
  const target = join(dwsRuntimeDir(), info.entry);
  return await isFile(target) ? target : undefined;
}

export function installedDwsVersion() {
  return installedTag();
}

export function probeDws(bin) {
  const result = spawnSync(bin, ['version', '--format', 'json'], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
    env: { ...process.env, DWS_CONFIG_DIR: dwsConfigDir() },
  });
  return result.status === 0 ? `${result.stdout}${result.stderr}`.trim() || undefined : undefined;
}
