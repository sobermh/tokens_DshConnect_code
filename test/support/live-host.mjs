import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Boot the installed Host for real and run this plugin's bridge inside it.
//
// `real-host-gateway.mjs` keeps the Host's gateway and descriptors but scripts
// the controllers; this fixture scripts nothing. It composes a throwaway
// `$DSH_HOME`, writes a profile whose bundles are the Host's own
// `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`, inserts the probe
// plugin, and launches the Host's own `dsh` launcher on it. What the probe
// then calls runs through the Host's real Workspace registry, Workspace and
// Session controllers, Connection service, remote-access policy and gateway.
//
// The profile resolves every bundle from `$DSH_HOST_ROOT/node_modules`, so the
// packages under test are the installed ones, never this repo's devDependencies.
//
// Cost: one Node process and a few seconds per run, so the suite boots once and
// every case reads the same report.

/** Installed Host root (a `dsh-plugin-desktop` directory), or undefined. */
export const HOST_ROOT = process.env.DSH_HOST_ROOT;
/** Reason these cases did not execute, or false when a Host is configured. */
export const SKIP_WITHOUT_LIVE_HOST = HOST_ROOT
  ? false
  : 'NOT EXECUTED: set DSH_HOST_ROOT to an installed host root (dsh-plugin-desktop)';

const PROBE_URL = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), 'live-host-probe.mjs'),
).href;
const PROFILE = 'live-contract';
/** The launcher boots a whole Host; a slow cold start must not read as a failure. */
const BOOT_TIMEOUT_MS = 180_000;

function hostLauncher() {
  const hostRequire = createRequire(resolve(HOST_ROOT, 'package.json'));
  return resolve(hostRequire.resolve('@deepseek-ai/dsh/package.json'), '..', 'lib/bin.js');
}

function composeHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-connect-live-home-'));
  const probe = join(home, 'node_modules', 'dsh-connect-live-probe');
  mkdirSync(probe, { recursive: true });
  writeFileSync(join(probe, 'package.json'), `${JSON.stringify({
    name: 'dsh-connect-live-probe',
    version: '0.0.0',
    private: true,
    type: 'module',
    main: 'index.mjs',
    exports: { '.': './index.mjs' },
  }, null, 2)}\n`);
  // The probe itself is a reviewed file in this repo; the package the loader
  // resolves is one line pointing at it.
  writeFileSync(join(probe, 'index.mjs'), `export * from ${JSON.stringify(PROBE_URL)};\n`);

  const profile = join(home, 'profiles', PROFILE);
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${PROFILE}`,
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }, null, 2)}\n`);
  writeFileSync(join(profile, 'cordis.yml'), '[]\n');
  writeFileSync(join(profile, 'cordis.patch.yml'), [
    '- id: web-runtime',
    '  config:',
    '    openBrowser: false',
    '    printUrl: false',
    '',
    '- insert:',
    '    - id: dsh-connect-live-probe',
    '      name: dsh-connect-live-probe',
    '',
  ].join('\n'));
  // Node resolves the bundles from the profile directory upwards: this
  // junction answers `@deepseek-ai/*` out of the installed Host, and the probe
  // is found one level further up in `$DSH_HOME/node_modules`.
  symlinkSync(
    resolve(HOST_ROOT, 'node_modules'),
    join(profile, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return home;
}

function launch(home, report) {
  return new Promise((settle) => {
    const child = spawn(process.execPath, [
      hostLauncher(), '--profile', PROFILE, '--port', '0', '--no-open',
    ], {
      cwd: home,
      env: { ...process.env, DSH_HOME: home, DSH_LIVE_PROBE_REPORT: report },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const collect = (chunk) => {
      output += chunk;
      // A runaway Host would otherwise buffer its whole log into this string.
      if (output.length > 200_000) output = output.slice(-200_000);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ output, timedOut: true });
    }, BOOT_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      settle({ output: `${output}\n${error.message}`, spawnFailed: true });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      settle({ output, code });
    });
  });
}

let booted;

/**
 * Boot the Host once per test process and return what the probe recorded.
 *
 * @returns the probe's steps plus the launcher's output for diagnosis.
 */
export function liveHostReport() {
  booted ??= (async () => {
    const home = composeHome();
    const report = join(home, 'live-probe-report.json');
    const run = await launch(home, report);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(report, 'utf8'));
    } catch {
      parsed = undefined;
    }
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 3 });
    } catch { /* a Host that is still exiting can hold a handle; the temp dir is disposable. */ }
    if (parsed === undefined) {
      throw new Error(`the live Host never reported; launcher said:\n${run.output.slice(-4000)}`);
    }
    return { ...parsed, launcher: run };
  })();
  return booted;
}

/**
 * One recorded case from the live run.
 *
 * @param report - the resolved {@link liveHostReport} value.
 * @param id - the probe step id.
 * @returns that step; throws when the probe never reached it.
 */
export function liveStep(report, id) {
  const step = report.steps.find((entry) => entry.id === id);
  if (step === undefined) {
    throw new Error(`the probe never reached ${id}; it recorded ${
      report.steps.map((entry) => entry.id).join(', ') || 'nothing'
    }${report.fatal === undefined ? '' : `, and failed with ${JSON.stringify(report.fatal)}`}`);
  }
  return step;
}

/**
 * Assert one step succeeded, reporting the Host's own error when it did not.
 *
 * @param report - the resolved {@link liveHostReport} value.
 * @param id - the probe step id.
 * @returns the value the step recorded.
 */
export function liveValue(report, id) {
  const step = liveStep(report, id);
  if (!step.ok) {
    throw new Error(`${id} failed on the live Host: ${JSON.stringify(step.error, null, 2)}`);
  }
  return step.value;
}
