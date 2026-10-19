// DSH runtime packages use module-local Symbol keys, so a second physical copy
// breaks Host service lookup. The invariant is "no second copy in this tree",
// and it is enforced in two places: nothing may request an install of one, and
// the lockfile must not contain one.
//
// `peerDependencies` is the one exception, because dsh 0.2 decides
// compatibility from that field alone -- it checks every `@deepseek-ai/dsh` or
// `@deepseek-ai/dsh-*` range against the running dsh version and disables the
// plugin when one is unsatisfied. Declaring nothing there buys no protection at
// all. Such a peer must be optional: npm and pnpm then skip resolving it, so it
// asks the host for a version without pulling a copy in. `assertDshDependencyPolicy`
// still rejects a non-optional one, and the lockfile check below is what
// actually proves no copy arrived.

/** Sections whose entries npm would install into this tree. */
const INSTALLING_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
/** Runtime packages that must come from the host, never from this tree. */
const DSH_RUNTIME_PACKAGE = /^@deepseek-ai\/dsh-/;
/** The names dsh 0.2 reads as host compatibility peers. */
const isHostPeer = (name) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-');
/** Lock paths that mean a physical copy was installed. */
const INSTALLED_DSH_PATH = /(?:^|\/)node_modules\/@deepseek-ai\/dsh-[^/]+(?:\/|$)/;

/**
 * Check a manifest and lockfile for anything that would place a second copy of
 * a DSH runtime package in this tree.
 * @param manifest - parsed package.json
 * @param lock - parsed package-lock.json
 * @throws if a DSH runtime package is requested, bundled, or installed
 */
export function assertDshDependencyPolicy(manifest, lock) {
  for (const section of INSTALLING_SECTIONS) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (DSH_RUNTIME_PACKAGE.test(name)) {
        throw new Error(`${name} must not be declared in ${section}; DSH runtime packages must come from the host`);
      }
    }
  }

  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (!isHostPeer(name)) continue;
    if (manifest.peerDependenciesMeta?.[name]?.optional !== true) {
      throw new Error(
        `${name} must be an optional peerDependency; a required one makes package managers install a second copy`,
      );
    }
  }

  const bundled = manifest.bundleDependencies ?? manifest.bundledDependencies ?? [];
  if (Array.isArray(bundled)) {
    for (const name of bundled) {
      if (DSH_RUNTIME_PACKAGE.test(name)) {
        throw new Error(`${name} must not be bundled; DSH runtime packages must come from the host`);
      }
    }
  }

  const installed = Object.keys(lock?.packages ?? {}).filter((path) => INSTALLED_DSH_PATH.test(path));
  if (installed.length > 0) {
    throw new Error(`package lock must not install DSH runtime packages: ${installed.join(', ')}`);
  }
}
