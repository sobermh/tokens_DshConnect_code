import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Audit source content, not commit titles: a selective sync is not a full merge.
const ref = process.argv[2] ?? '34a370bfef1fcf577327b822d2091d2157ded0f8';
const roots = ['src', 'plugin-src', 'test'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const revision = git('rev-parse', `${ref}^{commit}`).trim();
let policy = {};
try { policy = JSON.parse(readFileSync(new URL('../docs/im-upstream-exceptions.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const paths = (tree) => git('ls-tree', '-r', '--name-only', tree, '--', ...roots).trim().split('\n').filter(Boolean);
const upstreamPaths = new Set(paths(revision));
const localPaths = new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...roots)
  .trim().split('\n').filter(Boolean));
const specs = [...upstreamPaths].map((path) => `${revision}:${path}`);
const batch = execFileSync('git', ['cat-file', '--batch'], {
  input: specs.join('\n') + '\n', maxBuffer: 64 * 1024 * 1024,
});
const upstreamContents = new Map();
let offset = 0;
for (const path of upstreamPaths) {
  const end = batch.indexOf(10, offset);
  const size = Number(batch.subarray(offset, end).toString().split(' ')[2]);
  if (!Number.isSafeInteger(size)) throw new Error(`Cannot read upstream ${path}`);
  upstreamContents.set(path, batch.subarray(end + 1, end + 1 + size).toString('utf8'));
  offset = end + 1 + size + 1;
}
for (const side of ['host', 'client']) {
  const extension = side === 'host' ? 'mjs' : 'js';
  localPaths.add(`plugin-src/${side}/upstream-im.${extension}`);
  upstreamContents.set(`plugin-src/${side}/upstream-im.${extension}`,
    upstreamContents.get(`plugin-src/${side}/index.${extension}`));
}
const normalize = (text) => text.replaceAll('\r\n', '\n');
const files = [...new Set([...upstreamPaths, ...localPaths])].sort().map((path) => {
  let local;
  try { local = readFileSync(path, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const upstream = upstreamContents.get(path);
  const hash = local === undefined ? null : createHash('sha256').update(normalize(local)).digest('hex');
  const exception = policy.upstream === revision ? policy.files?.[path] : undefined;
  const reviewed = exception?.sha256 === hash && typeof exception?.reason === 'string';
  const status = upstream === undefined ? 'fork-only'
    : local === undefined ? 'missing-upstream-file'
      : normalize(local) === normalize(upstream) ? 'equal'
        : reviewed ? 'reviewed-fork-difference' : 'needs-review';
  return { path, status, ...(status === 'reviewed-fork-difference' ? { reason: exception.reason } : {}) };
});
const counts = {};
for (const file of files) counts[file.status] = (counts[file.status] ?? 0) + 1;
console.log(JSON.stringify({ upstream: revision, local: git('rev-parse', 'HEAD').trim(),
  complete: files.every((file) => ['equal', 'fork-only', 'reviewed-fork-difference'].includes(file.status)), counts, files }, null, 2));
if (process.argv.includes('--check') && files.some((file) => ['needs-review', 'missing-upstream-file'].includes(file.status))) {
  process.exitCode = 1;
}
