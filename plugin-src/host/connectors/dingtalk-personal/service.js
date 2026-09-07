import { buildDingtalkCapabilities } from './capabilities.js';

const INITIAL_LIVE_STATUS = Object.freeze({
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
});

export function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function connectedMessage(status) {
  return status.userName ? `钉钉已连接：${status.userName}` : '钉钉个人账号已连接。';
}

function publicLiveStatus(status) {
  const { profile: _profile, ...safe } = status;
  return safe;
}

export function createDingtalkPersonalService({ dws, ensureSkills, inspectSkills, logger }) {
  const state = {
    phase: 'idle',
    authorizeUrl: null,
    message: null,
  };
  let liveStatus = { ...INITIAL_LIVE_STATUS };
  let flowAbort;
  const phaseWaiters = new Set();

  function setState(next) {
    state.phase = next.phase;
    state.authorizeUrl = next.authorizeUrl ?? null;
    state.message = next.message ?? null;
    for (const wake of phaseWaiters) wake();
    phaseWaiters.clear();
  }

  async function loadLiveStatus(signal) {
    liveStatus = await dws.status(signal);
    if (liveStatus.authenticated && flowAbort === undefined && state.phase !== 'connected') {
      setState({ phase: 'connected', message: connectedMessage(liveStatus) });
    } else if (!liveStatus.authenticated && flowAbort === undefined && state.phase === 'connected') {
      setState({ phase: 'idle', message: liveStatus.message ?? '钉钉个人账号尚未授权。' });
    }
    return liveStatus;
  }

  async function status(signal) {
    if (flowAbort === undefined) {
      try {
        await loadLiveStatus(signal);
      } catch (error) {
        liveStatus = { ...liveStatus, authenticated: false, message: errorText(error) };
      }
    }
    const skills = await inspectSkills().catch(() => ({
      available: false,
      count: 0,
      names: [],
      collisions: [],
    }));
    return {
      ...publicLiveStatus(liveStatus),
      phase: state.phase,
      authorizeUrl: state.authorizeUrl,
      message: state.message ?? liveStatus.message,
      skills: {
        available: skills.available === true,
        version: skills.version ?? null,
        count: skills.count ?? 0,
        names: Array.isArray(skills.names) ? skills.names : [],
        collisions: Array.isArray(skills.collisions) ? skills.collisions : [],
        source: '$DSH_HOME/skills/.dws-skills.json',
      },
      capabilities: buildDingtalkCapabilities(skills),
    };
  }

  async function runConnect(force, signal) {
    const current = await loadLiveStatus(signal).catch(() => liveStatus);
    if (current.authenticated && !force) {
      ensureSkills().catch((error) => {
        logger?.warn?.('DWS skill materialization failed: %s', errorText(error));
      });
      setState({ phase: 'connected', message: connectedMessage(current) });
      return;
    }

    setState({ phase: 'preparing', message: '正在准备钉钉官方 DWS 组件...' });
    await dws.provision();
    const skillsPromise = ensureSkills().catch((error) => {
      logger?.warn?.('DWS skill materialization failed: %s', errorText(error));
      return undefined;
    });
    liveStatus = { ...liveStatus, installed: true };
    const authorized = await dws.login(signal, (authorizeUrl) => {
      setState({
        phase: 'authorizing',
        authorizeUrl,
        message: '打开钉钉官方页面并确认授权，完成后这里会自动更新。',
      });
    });
    liveStatus = authorized;
    await skillsPromise;
    setState({ phase: 'connected', message: connectedMessage(authorized) });
  }

  function startConnect(force = false) {
    if (flowAbort !== undefined) return false;
    const controller = new AbortController();
    flowAbort = controller;
    setState({ phase: 'preparing', message: '正在检查钉钉连接状态...' });
    runConnect(force, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) setState({ phase: 'error', message: errorText(error) });
      })
      .finally(() => {
        if (flowAbort === controller) flowAbort = undefined;
      });
    return true;
  }

  async function waitForAuthorizationStart(maxWaitMs = 20_000) {
    const attempts = Math.max(0, Math.ceil(maxWaitMs / 200));
    for (let index = 0; index < attempts
      && state.phase === 'preparing' && state.authorizeUrl === null; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  async function waitForProgress(waitMs, signal) {
    if (waitMs <= 0 || (state.phase !== 'preparing' && state.phase !== 'authorizing')) return;
    if (signal?.aborted) return;
    await new Promise((resolve) => {
      let timer;
      const wake = () => {
        clearTimeout(timer);
        phaseWaiters.delete(wake);
        signal?.removeEventListener('abort', wake);
        resolve();
      };
      timer = setTimeout(wake, waitMs);
      phaseWaiters.add(wake);
      signal?.addEventListener('abort', wake, { once: true });
    });
  }

  async function disconnect() {
    flowAbort?.abort();
    flowAbort = undefined;
    const current = await dws.status().catch(() => liveStatus);
    await dws.logout(undefined, current.profile ?? undefined);
    liveStatus = await dws.status().catch(() => ({
      ...current,
      authenticated: false,
      tokenValid: false,
      refreshTokenValid: false,
      userName: null,
      corpName: null,
      profile: null,
    }));
    setState({ phase: 'idle', message: '钉钉个人授权已解除，官方 DWS 组件仍保留在本机。' });
    return status();
  }

  async function refreshSkills() {
    await dws.provision();
    return ensureSkills(true);
  }

  function dispose() {
    flowAbort?.abort();
    flowAbort = undefined;
    for (const wake of phaseWaiters) wake();
    phaseWaiters.clear();
  }

  return Object.freeze({
    get phase() { return state.phase; },
    disconnect,
    dispose,
    execute: (args, options) => dws.execute(args, options),
    refreshSkills,
    startConnect,
    status,
    waitForAuthorizationStart,
    waitForProgress,
  });
}
