import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

import {
  dwsConfigDir,
  dwsPath,
  ensureDws,
  installedDwsVersion,
} from './dws-provision.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const LOGIN_TIMEOUT_MS = 15 * 60_000;
const MAX_OUTPUT_SIZE = 8 * 1024 * 1024;
const MAX_ERROR_DETAIL_SIZE = 4 * 1024;
const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const AUTH_URL_PATTERN = /https:\/\/login\.dingtalk\.com\/oauth2\/(?:device\/verify\.htm|auth)\?[^\s"'<>\u001b]+/g;
const AUTH_URL_REDACTION_PATTERN = /https:\/\/login\.dingtalk\.com\/oauth2\/(?:device\/verify\.htm|auth)(?:\?[^\s"'<>\u001b]+)?/gi;

const ALLOWED_TOP_LEVEL = new Set([
  'agoal', 'aisearch', 'aitable', 'api', 'attendance', 'calendar', 'chat', 'contact',
  'devapp', 'devdoc', 'ding', 'doc', 'doctor', 'drive', 'event', 'hrbrain', 'live',
  'mail', 'markdown', 'minutes', 'oa', 'profile', 'recruit', 'report', 'schema',
  'sheet', 'todo', 'version', 'whiteboard', 'wiki',
]);
const SECRET_FLAGS = new Set([
  '--token', '--client-id', '--client-secret', '--mcp-url', '--pre-url',
]);

function asString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function sanitizeDwsText(value) {
  return String(value ?? '')
    .replace(ANSI_ESCAPE, '')
    .replace(AUTH_URL_REDACTION_PATTERN, '[DingTalk authorization link redacted]')
    .replace(/("(?:access_token|refresh_token|client_secret|device_code|user_code|accessToken|refreshToken|clientSecret|deviceCode|userCode)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/\b(access[_-]?token|refresh[_-]?token|client[_-]?secret|device[_-]?code|user[_-]?code)\s*([:=])\s*([^\s,;]+)/gi, '$1$2[REDACTED]')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:--token|--client-secret)(?:=|\s+))[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:授权码|验证码|user\s+code|device\s+code)\s*[:=]\s*)[A-Z0-9-]+/gi, '$1[REDACTED]');
}

export function trustedDingtalkAuthorizationUrl(value) {
  const text = String(value ?? '').replace(ANSI_ESCAPE, '');
  for (const match of text.matchAll(AUTH_URL_PATTERN)) {
    try {
      const url = new URL(match[0]);
      if (url.protocol !== 'https:' || url.hostname !== 'login.dingtalk.com'
        || url.port !== '' || url.username !== '' || url.password !== '') continue;
      const keys = [...url.searchParams.keys()];
      if (url.pathname === '/oauth2/device/verify.htm') {
        const code = url.searchParams.get('user_code');
        if (keys.length === 1 && keys[0] === 'user_code'
          && code !== null && /^[A-Z0-9]{4,12}(?:-[A-Z0-9]{2,12})+$/.test(code)) {
          return url.href;
        }
        continue;
      }
      if (url.pathname !== '/oauth2/auth') continue;
      const allowedKeys = new Set([
        'client_id', 'redirect_uri', 'response_type', 'scope', 'prompt', 'corpId',
      ]);
      if (keys.length < 5 || keys.length > 6 || new Set(keys).size !== keys.length
        || keys.some((key) => !allowedKeys.has(key))) continue;
      const clientId = url.searchParams.get('client_id');
      const redirectValue = url.searchParams.get('redirect_uri');
      const corpId = url.searchParams.get('corpId');
      if (clientId === null || clientId.trim() === '' || clientId.length > 256
        || redirectValue === null
        || (corpId !== null && (corpId.trim() === '' || corpId.length > 256))
        || url.searchParams.get('response_type') !== 'code'
        || url.searchParams.get('scope') !== 'openid corpid'
        || url.searchParams.get('prompt') !== 'consent') continue;
      const redirect = new URL(redirectValue);
      const port = Number(redirect.port);
      if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1'
        || !Number.isInteger(port) || port < 1 || port > 65_535
        || redirect.pathname !== '/callback' || redirect.search !== '' || redirect.hash !== ''
        || redirect.username !== '' || redirect.password !== '') continue;
      return url.href;
    } catch {
      // Keep scanning in case a later URL is valid.
    }
  }
  return undefined;
}

export function createAuthorizationUrlParser(onUrl) {
  let buffer = '';
  let emitted;
  return Object.freeze({
    push(chunk) {
      if (emitted !== undefined) return emitted;
      buffer = `${buffer}${String(chunk)}`.slice(-32 * 1024);
      const lineEnd = Math.max(buffer.lastIndexOf('\n'), buffer.lastIndexOf('\r'));
      if (lineEnd < 0) return undefined;
      const completeLines = buffer.slice(0, lineEnd + 1);
      buffer = buffer.slice(lineEnd + 1);
      const url = trustedDingtalkAuthorizationUrl(completeLines);
      if (url !== undefined) {
        emitted = url;
        onUrl?.(url);
      }
      return emitted;
    },
    value() {
      return emitted;
    },
  });
}

function dwsEnvironment() {
  return { ...process.env, DWS_CONFIG_DIR: dwsConfigDir() };
}

export function runDwsProcess(bin, args, {
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onOutput,
  spawnImpl = spawn,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(bin, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: dwsEnvironment(),
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const terminate = (message) => finish(() => {
      child.kill();
      reject(new Error(message));
    });
    const timer = setTimeout(
      () => terminate(`dws ${args[0] ?? ''} timed out after ${Math.round(timeoutMs / 1000)}s`),
      timeoutMs,
    );
    const onAbort = () => terminate('dws command cancelled');
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    const append = (stream, chunk) => {
      const text = String(chunk);
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      onOutput?.(text, stream);
      if (stdout.length + stderr.length > MAX_OUTPUT_SIZE) terminate('dws output exceeded the safe limit');
    };
    child.stdout.on('data', (chunk) => append('stdout', chunk));
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => finish(() => resolve({ code: code ?? -1, stdout, stderr })));
  });
}

export function parseDwsJson(output) {
  const clean = String(output ?? '').replace(ANSI_ESCAPE, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('dws returned no JSON object');
  return JSON.parse(clean.slice(start, end + 1));
}

export function statusFromMap(map, version) {
  const authenticated = map?.authenticated === true;
  const corpId = asString(map?.corp_id) ?? asString(map?.corpId);
  const userId = asString(map?.user_id) ?? asString(map?.userId);
  return {
    installed: true,
    version: asString(version)?.replace(/^v/, '') ?? null,
    authenticated,
    tokenValid: map?.token_valid === true || map?.tokenValid === true,
    refreshTokenValid: map?.refresh_token_valid === true || map?.refreshTokenValid === true,
    userName: asString(map?.user_name) ?? asString(map?.userName) ?? null,
    corpName: asString(map?.corp_name) ?? asString(map?.corpName) ?? null,
    expiresAt: asString(map?.expires_at) ?? asString(map?.expiresAt) ?? null,
    refreshExpiresAt: asString(map?.refresh_expires_at) ?? asString(map?.refreshExpiresAt) ?? null,
    message: authenticated ? null : asString(map?.message) ?? '未登录',
    profile: corpId !== undefined && userId !== undefined ? `${corpId}:${userId}` : null,
  };
}

export function validateDwsToolArgs(args, confirmed = false) {
  if (!Array.isArray(args) || args.length === 0 || args.length > 80
    || !args.every((arg) => typeof arg === 'string' && arg !== '' && arg.length <= 16_384)) {
    throw new Error('dws args must be an array of 1 to 80 non-empty strings');
  }
  const topLevel = args[0].toLowerCase();
  if (!ALLOWED_TOP_LEVEL.has(topLevel)) {
    throw new Error(`dws command ${args[0]} is not available through this tool`);
  }
  if (topLevel === 'profile' && args[1]?.toLowerCase() !== 'list') {
    throw new Error('the dws tool only allows the read-only profile list command');
  }
  for (const arg of args) {
    const normalized = arg.toLowerCase();
    const flag = normalized.split('=', 1)[0];
    if (SECRET_FLAGS.has(flag)) throw new Error(`dws flag ${flag} is not allowed`);
    if (normalized === '--yes' || normalized === '-y') {
      throw new Error('pass confirmed=true instead of adding --yes directly');
    }
  }
  return confirmed ? [...args, '--yes'] : [...args];
}

function commandFailure(result, action) {
  const sanitized = sanitizeDwsText(result.stderr.trim() || result.stdout.trim()).trim();
  const detail = sanitized.length > MAX_ERROR_DETAIL_SIZE
    ? `${sanitized.slice(0, MAX_ERROR_DETAIL_SIZE)}\n[output truncated]`
    : sanitized;
  const exit = Number.isInteger(result.code) ? ` (exit code ${result.code})` : '';
  return new Error(`dws ${action} failed${exit}${detail === '' ? '' : `: ${detail}`}`);
}

export function createDws(internals = {}) {
  const ensureDwsImpl = internals.ensureDws ?? ensureDws;
  const dwsPathImpl = internals.dwsPath ?? dwsPath;
  const installedVersionImpl = internals.installedDwsVersion ?? installedDwsVersion;
  const runImpl = internals.run ?? runDwsProcess;

  async function run(bin, args, options) {
    await mkdir(dwsConfigDir(), { recursive: true });
    return runImpl(bin, args, options);
  }

  async function readStatus(bin, signal) {
    const result = await run(bin, ['auth', 'status', '--format', 'json'], { signal });
    try {
      return statusFromMap(parseDwsJson(result.stdout || result.stderr), await installedVersionImpl());
    } catch {
      return statusFromMap({ authenticated: false, message: '无法读取 DWS 授权状态' }, await installedVersionImpl());
    }
  }

  async function status(signal) {
    const bin = await dwsPathImpl();
    if (bin !== undefined) return readStatus(bin, signal);
    return {
      installed: false,
      version: null,
      authenticated: false,
      tokenValid: false,
      refreshTokenValid: false,
      userName: null,
      corpName: null,
      expiresAt: null,
      refreshExpiresAt: null,
      message: 'DWS 尚未安装',
      profile: null,
    };
  }

  return Object.freeze({
    async provision() {
      return ensureDwsImpl();
    },

    status,

    async login(signal, onAuthorizeUrl) {
      const bin = await ensureDwsImpl();
      const parser = createAuthorizationUrlParser(onAuthorizeUrl);
      const result = await run(bin, [
        'auth', 'login', '--recommend', '--no-browser', '--format', 'json',
      ], {
        signal,
        timeoutMs: LOGIN_TIMEOUT_MS,
        onOutput: (chunk) => parser.push(chunk),
      });
      parser.push('\n');
      const current = await readStatus(bin, signal);
      if (current.authenticated) return current;
      if (result.code !== 0) {
        throw commandFailure(result, 'auth login');
      }
      if (parser.value() === undefined) {
        throw new Error('DWS authorization did not provide a trusted DingTalk login link.');
      }
      if (!current.authenticated) throw new Error('DWS authorization finished without a valid login.');
      return current;
    },

    async logout(signal, profile) {
      const bin = await dwsPathImpl();
      if (bin === undefined) return;
      const args = ['auth', 'logout'];
      if (typeof profile === 'string' && profile !== '') args.push('--profile', profile);
      args.push('--yes', '--format', 'json');
      const result = await run(bin, args, { signal });
      if (result.code !== 0) throw commandFailure(result, 'auth logout');
    },

    async execute(args, { signal, confirmed = false } = {}) {
      const argv = validateDwsToolArgs(args, confirmed);
      const bin = await ensureDwsImpl();
      const result = await run(bin, argv, { signal });
      if (result.code !== 0) throw commandFailure(result, argv[0]);
      return {
        exitCode: result.code,
        stdout: sanitizeDwsText(result.stdout),
        stderr: sanitizeDwsText(result.stderr),
      };
    },
  });
}
