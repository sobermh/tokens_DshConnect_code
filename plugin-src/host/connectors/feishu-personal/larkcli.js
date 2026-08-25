/**
 * Thin orchestrator around the official Larksuite CLI. The CLI owns the whole
 * user identity: it runs the device-code login internally (no redirect, no
 * whitelist, no admin approval) and persists the resulting user token in the OS
 * keychain/DPAPI. This module only spawns it, feeds the app secret over stdin
 * (never argv), parses its `--json` output leniently, and exposes the handful
 * of commands the connect flow and domain tools need — including the generic
 * `lark-cli api` passthrough, which is how every OpenAPI call is made now.
 * @module
 */
import { spawn } from 'node:child_process';
import { assertLarkProfileName } from "./identity.js";
import { ensureLarkcli, larkcliPath } from "./larkcli-provision.js";
/** lark-cli scope groups requested at device login. */
export const LOGIN_DOMAINS = 'approval,base,contact,docs,drive,im';
const DEFAULT_TIMEOUT_MS = 60_000;
/** Device login blocks until the user authorizes in the browser; allow minutes. */
const LOGIN_COMPLETE_TIMEOUT_MS = 300_000;
function runLarkcli(bin, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, [...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const finish = (fn) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
            fn();
        };
        const timer = setTimeout(() => finish(() => {
            child.kill();
            reject(new Error(`lark-cli ${args[0] ?? ''} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }), timeoutMs);
        const onAbort = () => finish(() => {
            child.kill();
            reject(new Error('lark-cli command cancelled'));
        });
        options.signal?.addEventListener('abort', onAbort, { once: true });
        child.stdout.on('data', (chunk) => { stdout += String(chunk); });
        child.stderr.on('data', (chunk) => { stderr += String(chunk); });
        child.on('error', (error) => finish(() => reject(error)));
        child.on('close', (code) => finish(() => resolve({ code: code ?? -1, stdout, stderr })));
        if (options.stdin !== undefined)
            child.stdin.end(options.stdin);
        else
            child.stdin.end();
    });
}
/**
 * Parse lark-cli JSON output leniently. The CLI may prepend human-readable
 * notices before the JSON body, so scan to the first `{` and parse to the last
 * `}`.
 */
function larkcliJSON(output) {
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start < 0 || end <= start)
        throw new Error('lark-cli: no JSON object in output');
    return JSON.parse(output.slice(start, end + 1));
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : undefined;
}
function asString(value) {
    return typeof value === 'string' && value !== '' ? value : undefined;
}
function connectedFrom(tokenStatus, available) {
    switch (tokenStatus) {
        case 'valid':
        case 'ready':
            return true;
        case 'expired':
        case 'invalid':
        case 'revoked':
            return false;
        default:
            return available;
    }
}
function projectStatus(identity) {
    const tokenStatus = asString(identity['tokenStatus']);
    const available = identity['available'] === true;
    const status = { connected: connectedFrom(tokenStatus, available) };
    if (tokenStatus !== undefined)
        status.tokenStatus = tokenStatus;
    const userName = asString(identity['userName']);
    if (userName !== undefined)
        status.userName = userName;
    const openId = asString(identity['openId']) ?? asString(identity['open_id']);
    if (openId !== undefined)
        status.openId = openId;
    return status;
}
/** Pull the user identity out of `auth status` (nested `identities.user`, or a flat shape). */
function statusFromMap(map) {
    const identities = asRecord(map['identities']);
    const user = identities === undefined ? undefined : asRecord(identities['user']);
    if (user !== undefined)
        return projectStatus(user);
    // Backward-compat flat shape: fields live at the top level.
    return projectStatus(map);
}
/**
 * Build the non-secret argv for profile initialization. Kept separate so the
 * Feishu/Lark routing decision is directly testable; the app secret is still
 * supplied only over stdin by {@link createLarkcli}.
 */
export function configInitArgs(appId, profile, brand) {
    return [
        'config', 'init', '--app-id', appId, '--app-secret-stdin',
        '--brand', brand, '--name', profile, '--force-init',
    ];
}
/**
 * Build the lark-cli orchestrator bound to one profile.
 * @param options - profile name and OpenAPI origin.
 * @returns command wrappers over the managed lark-cli binary.
 */
export function createLarkcli(options) {
    const { profile, baseURL } = options;
    assertLarkProfileName(profile);
    async function run(args, runOptions = {}) {
        const bin = await ensureLarkcli();
        return runLarkcli(bin, args, runOptions);
    }
    function ensureOk(result, action) {
        if (result.code === 0)
            return;
        let detail = result.stderr.trim() || result.stdout.trim();
        try {
            const error = asRecord(larkcliJSON(result.stdout || result.stderr)['error']);
            const message = error === undefined ? undefined : asString(error['message']);
            if (message !== undefined)
                detail = message;
        }
        catch { /* fall back to raw text */ }
        throw new Error(`lark-cli ${action} failed${detail === '' ? '' : `: ${detail}`}`);
    }
    return {
        /** Download+verify the binary now (so the flow can surface a "preparing" step). */
        async provision() {
            await ensureLarkcli();
        },
        /**
         * Bind the created app's credentials to the profile (secret via stdin).
         *
         * `--force-init` is required because lark-cli v1.0.76 refuses `config init`
         * whenever it detects an "Agent context" (the ambient `HERMES_HOME` or
         * `OPENCLAW_HOME` env var, e.g. a personal Hermes install on the machine),
         * to avoid shadowing that agent's own binding. We deliberately want our own
         * app — the one one-click registration just minted — so we take the CLI's
         * documented escape hatch and pin every later call to our named profile.
         */
        async configInit(appId, appSecret, brand, signal) {
            const result = await run(configInitArgs(appId, profile, brand), { stdin: appSecret, signal });
            ensureOk(result, 'config init');
            const use = await run(['profile', 'use', profile], { signal });
            ensureOk(use, 'profile use');
        },
        /** Begin the device-code login; returns the link and code to poll. */
        async loginBegin(signal) {
            const result = await run(['auth', 'login', '--no-wait', '--json', '--domain', LOGIN_DOMAINS, '--profile', profile], { signal });
            ensureOk(result, 'auth login');
            const map = larkcliJSON(result.stdout);
            const verificationUrl = asString(map['verification_url']);
            const deviceCode = asString(map['device_code']);
            if (verificationUrl === undefined || deviceCode === undefined) {
                throw new Error('lark-cli auth login did not return a verification URL and device code');
            }
            return { verificationUrl, deviceCode };
        },
        /** Wait for the user to authorize in the browser and finish the login. */
        async loginComplete(deviceCode, signal) {
            const result = await run(['auth', 'login', '--device-code', deviceCode, '--json', '--profile', profile], { signal, timeoutMs: LOGIN_COMPLETE_TIMEOUT_MS });
            ensureOk(result, 'auth login (device-code)');
            return statusFromMap(larkcliJSON(result.stdout));
        },
        /** Report the current user-identity connection state, or `undefined` if lark-cli is not installed. */
        async status(signal) {
            if ((await larkcliPath()) === undefined)
                return undefined;
            const result = await run(['auth', 'status', '--json', '--profile', profile], { signal });
            // `auth status` exits non-zero when logged out; the JSON still describes that.
            try {
                return statusFromMap(larkcliJSON(result.stdout || result.stderr));
            }
            catch {
                return { connected: false };
            }
        },
        /** Clear the stored user session. */
        async logout(signal) {
            await run(['auth', 'logout', '--json', '--profile', profile], { signal })
                .catch(() => { });
        },
        /**
         * Call any OpenAPI endpoint through lark-cli with the stored user token.
         * Returns the envelope's `data` field; throws on a non-zero `code`.
         */
        async api(method, path, opts = {}, signal) {
            const args = ['api', method, path, '--as', opts.as ?? 'user', '--format', 'json', '--profile', profile];
            if (opts.params !== undefined)
                args.push('--params', JSON.stringify(opts.params));
            if (opts.data !== undefined)
                args.push('--data', JSON.stringify(opts.data));
            const result = await run(args, { signal });
            let map;
            try {
                map = larkcliJSON(result.stdout || result.stderr);
            }
            catch {
                ensureOk(result, `api ${method} ${path}`);
                throw new Error(`lark-cli api ${method} ${path} returned no JSON`);
            }
            const code = typeof map['code'] === 'number' ? map['code'] : undefined;
            if (code !== undefined && code !== 0) {
                const msg = asString(map['msg']) ?? 'unknown error';
                throw new Error(`Feishu ${method} ${path} failed: code ${code} ${msg}`);
            }
            if (result.code !== 0 && code === undefined)
                ensureOk(result, `api ${method} ${path}`);
            return (map['data'] ?? {});
        },
        /** OpenAPI origin this instance targets (for building resource URLs). */
        baseURL,
    };
}
