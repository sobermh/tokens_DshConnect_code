import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `session.follow` / `session.page` hand the host bridge a `SessionHistoryRecord`
// array, and the bridge's `expandChunkRecord` has an arm for a packed
// `{ type: 'chunks' }` record that no host still resolvable here produces.  A
// fixture cannot say whether that arm is dead, only that the fixture matches the
// code.  The host does publish the union, as a discriminated type in the
// session controller's own `lib/types` declarations, so read the discriminants
// from there: the arm is provably unreachable while `event` is the only one, and
// the day a host adds another the check fails instead of leaving an arm nobody
// has exercised since 0.1.3-alpha.1.

const UNION = /^\s*export\s+type\s+SessionHistoryRecord\s*=\s*([^;]+);/m;
const DISCRIMINANT = /\breadonly\s+type\s*:\s*'([^']+)'/;

function interfaceBody(text, name) {
  const header = new RegExp(`^\\s*(?:export\\s+)?interface\\s+${name}\\s*\\{`, 'm').exec(text);
  if (header === null) return undefined;
  const open = header.index + header[0].length;
  const close = text.indexOf('}', open);
  return close < 0 ? undefined : text.slice(open, close);
}

/**
 * The discriminant literals the installed host's session history record union
 * admits.
 *
 * @param hostRoot - directory holding the host's `package.json`, so the scan
 *   follows the same resolution the plugin gets at runtime.
 * @returns the sorted `type` literals, or an empty array when this host
 *   publishes no such union, which callers must treat as "cannot tell".
 * @throws when the union is published in a shape this scan cannot read, since
 *   silently reporting "no variants" would read as "the packed arm is dead".
 */
export function declaredHistoryRecordTypes(hostRoot) {
  const hostRequire = createRequire(resolve(hostRoot, 'package.json'));
  let types;
  try {
    types = hostRequire.resolve('@deepseek-ai/dsh-api-session-controller/package.json');
  } catch {
    return [];
  }
  const text = readFileSync(resolve(types, '../lib/types/types.d.ts'), 'utf8');
  const union = UNION.exec(text);
  if (union === null) return [];
  const discriminants = new Set();
  for (const member of union[1].split('|')) {
    const name = member.trim();
    const body = /^[A-Za-z_$][\w$]*$/.test(name) ? interfaceBody(text, name) : name;
    const discriminant = body === undefined ? null : DISCRIMINANT.exec(body);
    if (discriminant === null) {
      throw new Error(`cannot read the discriminant of SessionHistoryRecord member "${name}"`);
    }
    discriminants.add(discriminant[1]);
  }
  return [...discriminants].sort();
}
