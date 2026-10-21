import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// `ctx.on('<name>', ...)` accepts any string, so the host has no way to tell a
// plugin that it renamed an event: the listener simply never fires and the
// feature it drives goes quiet.  That is exactly how the run_code dispatch
// rename landed in dsh 0.1.5, and how `assistant/chunk` was misread as a
// missing host event (it is this plugin's own transient name, never a host
// one).  The host does publish its Cordis surface, in the `lib/types`
// declarations each `@deepseek-ai/*` package ships, and a rename necessarily
// shows up there.  Scanning it is the cheapest "let the host check itself"
// path available for bus events.

const DECLARATION = /^\s*(?:readonly\s+)?'([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)+)'\s*\(/gm;

function typeDeclarationFiles(directory, out = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(directory, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) typeDeclarationFiles(full, out);
    else if (entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Every Cordis event name the installed host declares a listener signature for.
 *
 * @param hostRoot - directory holding the host's `package.json`, so the scan
 *   follows the same resolution the plugin gets at runtime.
 * @returns the declared `namespace/name` events; empty when the host ships no
 *   type declarations, which callers must treat as "cannot tell", not "none".
 */
export function declaredHostBusEvents(hostRoot) {
  const hostRequire = createRequire(resolve(hostRoot, 'package.json'));
  // Resolve one known package to find the installed @deepseek-ai scope, rather
  // than guessing at a node_modules layout.
  const scope = resolve(hostRequire.resolve('@deepseek-ai/dsh-session/package.json'), '../..');
  const names = new Set();
  for (const packageDirectory of readdirSync(scope)) {
    for (const file of typeDeclarationFiles(join(scope, packageDirectory, 'lib', 'types'))) {
      const text = readFileSync(file, 'utf8');
      for (const [, name] of text.matchAll(DECLARATION)) names.add(name);
    }
  }
  return names;
}
