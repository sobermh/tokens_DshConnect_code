import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validateRelease(manifest, tag) {
  if (manifest.name !== '@tokensapi/dsh-connect') throw new Error('Unexpected release package name');
  if (manifest.publishConfig?.registry !== 'https://npm.tokensapi.ai/'
    || manifest.publishConfig?.access === 'public') {
    throw new Error('Release must target the private Verdaccio registry');
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) {
    throw new Error('Only stable versions may update latest');
  }
  if (tag !== `v${manifest.version}`) throw new Error('Release tag must match package.json version');
  return manifest.version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  validateRelease(manifest, process.argv[2]);
  console.log(`Validated ${manifest.name}@${manifest.version} for Verdaccio`);
}
