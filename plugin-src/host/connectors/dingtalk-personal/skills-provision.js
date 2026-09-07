import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { readZipEntries } from './archive.js';
import {
  downloadVerifiedDwsAsset,
  installedDwsVersion,
  resolveDshHome,
  resolveDwsRelease,
} from './dws-provision.js';

const MANAGED_SKILL_NAME = /^dingtalk-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OWNER = '@tokens/dsh-connect';
const SENTINEL = 'dingtalk-shared';
const STAMP_NAME = '.dws-skills.json';
const OWNER_MARKER = '.tokens-dws-managed.json';
const MAX_SKILLS_ARCHIVE_SIZE = 32 * 1024 * 1024;

function skillsRoot() {
  return join(resolveDshHome(), 'skills');
}

function stampPath(root) {
  return join(root, STAMP_NAME);
}

function ownerMarkerPath(root, name) {
  return join(managedSkillDir(root, name), OWNER_MARKER);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function assertManagedDwsSkillName(name) {
  if (!MANAGED_SKILL_NAME.test(name)) {
    throw new Error(`dws skills: invalid managed skill name: ${name}`);
  }
}

export function managedSkillDir(root, name) {
  assertManagedDwsSkillName(name);
  const safeRoot = resolve(root);
  const destination = resolve(safeRoot, name);
  if (!destination.startsWith(`${safeRoot}${sep}`)) {
    throw new Error(`dws skills: skill path escapes root: ${name}`);
  }
  return destination;
}

async function readStamp(root) {
  try {
    const stamp = JSON.parse(await readFile(stampPath(root), 'utf8'));
    if (stamp.owner !== OWNER || typeof stamp.dwsVersion !== 'string'
      || typeof stamp.materializedAt !== 'string' || !Array.isArray(stamp.skills)
      || !stamp.skills.every((name) => typeof name === 'string' && MANAGED_SKILL_NAME.test(name))
      || !Array.isArray(stamp.collisions ?? [])
      || !(stamp.collisions ?? []).every((name) => typeof name === 'string' && MANAGED_SKILL_NAME.test(name))) {
      return undefined;
    }
    return stamp;
  } catch {
    return undefined;
  }
}

async function hasOwnerMarker(root, name) {
  try {
    const marker = JSON.parse(await readFile(ownerMarkerPath(root, name), 'utf8'));
    return marker.owner === OWNER && marker.skill === name;
  } catch {
    return false;
  }
}

function parseSkillsArchive(archive) {
  const entries = readZipEntries(archive, {
    select: (name) => name.startsWith('multi/'),
    maxEntrySize: 8 * 1024 * 1024,
    maxTotalSize: 96 * 1024 * 1024,
  });
  const files = new Map();
  const skillNames = new Set();
  for (const entry of entries) {
    const match = entry.name.match(/^multi\/(dingtalk-[a-z0-9]+(?:-[a-z0-9]+)*)\/(.+)$/);
    if (match === null) continue;
    const [, skillName, relativePath] = match;
    assertManagedDwsSkillName(skillName);
    if (relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      throw new Error(`dws skills: unsafe file path: ${entry.name}`);
    }
    const key = `${skillName}/${relativePath}`;
    if (files.has(key)) throw new Error(`dws skills: duplicate file path: ${entry.name}`);
    files.set(key, entry.data);
    skillNames.add(skillName);
  }
  const names = [...skillNames].sort();
  if (!names.includes(SENTINEL)) throw new Error(`dws skills: ${SENTINEL} is missing from the archive`);
  for (const name of names) {
    if (!files.has(`${name}/SKILL.md`)) throw new Error(`dws skills: ${name}/SKILL.md is missing`);
  }
  return { names, files };
}

async function replaceDirectory(staging, target) {
  const backup = `${target}.${process.pid}.${Date.now()}.old`;
  const existed = await pathExists(target);
  if (existed) await rename(target, backup);
  try {
    await rename(staging, target);
    if (existed) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (existed) await rename(backup, target).catch(() => {});
    throw error;
  }
}

async function writeStagingSkill(stagingRoot, name, files, version) {
  const target = managedSkillDir(stagingRoot, name);
  await mkdir(target, { recursive: true });
  for (const [key, data] of files) {
    if (!key.startsWith(`${name}/`)) continue;
    const relativePath = key.slice(name.length + 1);
    const destination = resolve(target, relativePath);
    if (!destination.startsWith(`${target}${sep}`)) {
      throw new Error(`dws skills: file path escapes skill directory: ${key}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  await writeFile(join(target, OWNER_MARKER), `${JSON.stringify({
    owner: OWNER,
    skill: name,
    dwsVersion: version,
  }, null, 2)}\n`, { mode: 0o600 });
}

/** Install a verified official skills archive without overwriting unmanaged directories. */
export async function installDwsSkillsArchive(archive, { root = skillsRoot(), version }) {
  if (typeof version !== 'string' || version === '') throw new Error('dws skills: version is required');
  const { names, files } = parseSkillsArchive(archive);
  const previous = await readStamp(root);
  const previousNames = new Set(previous?.skills ?? []);
  await mkdir(root, { recursive: true });

  const installable = [];
  const collisions = [];
  for (const name of names) {
    const destination = managedSkillDir(root, name);
    if (!await pathExists(destination)) {
      installable.push(name);
      continue;
    }
    if (previousNames.has(name) && await hasOwnerMarker(root, name)) installable.push(name);
    else collisions.push(name);
  }

  const stagingRoot = join(root, `.dws-skills-${process.pid}-${Date.now()}.part`);
  await mkdir(stagingRoot, { recursive: true });
  try {
    for (const name of installable) await writeStagingSkill(stagingRoot, name, files, version);
    for (const name of installable) {
      await replaceDirectory(managedSkillDir(stagingRoot, name), managedSkillDir(root, name));
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }

  for (const oldName of previous?.skills ?? []) {
    if (!names.includes(oldName) && await hasOwnerMarker(root, oldName)) {
      await rm(managedSkillDir(root, oldName), { recursive: true, force: true });
    }
  }

  const stamp = {
    owner: OWNER,
    dwsVersion: version,
    skills: installable,
    collisions,
    materializedAt: new Date().toISOString(),
  };
  await writeFile(stampPath(root), `${JSON.stringify(stamp, null, 2)}\n`, { mode: 0o600 });
  return {
    version,
    count: installable.length,
    names: installable,
    collisions,
    root,
    skipped: false,
  };
}

async function isCurrent(root, version, stamp) {
  if (stamp?.dwsVersion !== version || !stamp.skills.includes(SENTINEL)) return false;
  for (const name of stamp.skills) {
    if (!await fileExists(join(managedSkillDir(root, name), 'SKILL.md'))
      || !await hasOwnerMarker(root, name)) return false;
  }
  return true;
}

let ensureInFlight;
async function ensureDwsSkillsImpl(force) {
  const root = skillsRoot();
  await mkdir(root, { recursive: true });
  const existing = await readStamp(root);
  let release;
  try {
    release = await resolveDwsRelease();
  } catch (error) {
    if (existing !== undefined && await isCurrent(root, existing.dwsVersion, existing)) {
      return {
        version: existing.dwsVersion,
        count: existing.skills.length,
        names: [...existing.skills],
        collisions: [...(existing.collisions ?? [])],
        root,
        skipped: true,
        offline: true,
      };
    }
    throw error;
  }
  const version = release.tag ?? await installedDwsVersion() ?? 'unknown';
  if (!force && await isCurrent(root, version, existing)) {
    return {
      version,
      count: existing.skills.length,
      names: [...existing.skills],
      collisions: [...(existing.collisions ?? [])],
      root,
      skipped: true,
    };
  }
  const archive = await downloadVerifiedDwsAsset(release, 'dws-skills.zip', MAX_SKILLS_ARCHIVE_SIZE);
  return installDwsSkillsArchive(archive, { root, version });
}

export function ensureDwsSkills(force = false) {
  if (ensureInFlight === undefined) {
    const request = ensureDwsSkillsImpl(force);
    const tracked = request.then(
      (value) => {
        if (ensureInFlight === tracked) ensureInFlight = undefined;
        return value;
      },
      (error) => {
        if (ensureInFlight === tracked) ensureInFlight = undefined;
        throw error;
      },
    );
    ensureInFlight = tracked;
  }
  return ensureInFlight;
}

export async function inspectDwsSkills(root = skillsRoot()) {
  const stamp = await readStamp(root);
  if (stamp === undefined) {
    return { available: false, count: 0, names: [], collisions: [] };
  }
  const names = [];
  for (const name of stamp.skills) {
    if (await fileExists(join(managedSkillDir(root, name), 'SKILL.md'))
      && await hasOwnerMarker(root, name)) names.push(name);
  }
  return {
    available: names.includes(SENTINEL),
    version: stamp.dwsVersion,
    count: names.length,
    names,
    collisions: [...(stamp.collisions ?? [])],
    materializedAt: stamp.materializedAt,
  };
}
