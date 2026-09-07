import { defineTool } from '@deepseek-ai/dsh-tools';

import { buildDingtalkCapabilities } from './capabilities.js';
import { createDws } from './dws.js';
import { DINGTALK_INTENT_ROUTING_PROMPT } from './intent-routing.js';
import { ensureDwsSkills, inspectDwsSkills } from './skills-provision.js';

export const name = 'dingtalk-personal';
export const inject = ['tools'];

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function publicLiveStatus(status) {
  const { profile: _profile, ...safe } = status;
  return safe;
}

export async function apply(ctx, _config = {}, internals = {}) {
  const dws = (internals.createDws ?? createDws)(internals.dwsInternals);
  const ensureSkills = internals.ensureDwsSkills ?? ensureDwsSkills;
  const inspectSkills = internals.inspectDwsSkills ?? inspectDwsSkills;
  const state = {
    phase: 'idle',
    authorizeUrl: null,
    message: null,
  };
  let liveStatus = {
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
  let flowAbort;
  const phaseWaiters = new Set();

  function setState(next) {
    state.phase = next.phase;
    state.authorizeUrl = next.authorizeUrl ?? null;
    state.message = next.message ?? null;
    for (const wake of phaseWaiters) wake();
    phaseWaiters.clear();
  }

  ctx.effect(() => () => flowAbort?.abort());

  async function loadLiveStatus(signal) {
    liveStatus = await dws.status(signal);
    if (liveStatus.authenticated && flowAbort === undefined && state.phase !== 'connected') {
      setState({
        phase: 'connected',
        message: liveStatus.userName
          ? `钉钉已连接：${liveStatus.userName}`
          : '钉钉个人账号已连接。',
      });
    } else if (!liveStatus.authenticated && flowAbort === undefined && state.phase === 'connected') {
      setState({ phase: 'idle', message: liveStatus.message ?? '钉钉个人账号尚未授权。' });
    }
    return liveStatus;
  }

  async function settingsStatus(signal) {
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
        ctx.logger?.warn?.('DWS skill materialization failed: %s', errorText(error));
      });
      setState({
        phase: 'connected',
        message: current.userName ? `钉钉已连接：${current.userName}` : '钉钉个人账号已连接。',
      });
      return;
    }

    setState({ phase: 'preparing', message: '正在准备钉钉官方 DWS 组件...' });
    await dws.provision();
    const skillsPromise = ensureSkills().catch((error) => {
      ctx.logger?.warn?.('DWS skill materialization failed: %s', errorText(error));
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
    setState({
      phase: 'connected',
      message: authorized.userName ? `钉钉已连接：${authorized.userName}` : '钉钉个人账号已连接。',
    });
  }

  function startConnect(force = false) {
    if (flowAbort !== undefined) return;
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
    return settingsStatus();
  }

  const statusOutput = {
    type: 'object',
    properties: {
      phase: {
        type: 'string',
        required: true,
        enum: ['idle', 'preparing', 'authorizing', 'connected', 'error'],
      },
      authorizeUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
      message: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
      installed: { type: 'boolean', required: true },
      version: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
      authenticated: { type: 'boolean', required: true },
      tokenValid: { type: 'boolean', required: true },
      refreshTokenValid: { type: 'boolean', required: true },
      userName: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
      corpName: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
      expiresAt: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
      refreshExpiresAt: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
      skills: {
        type: 'object',
        required: true,
        properties: {
          available: { type: 'boolean', required: true },
          version: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
          count: { type: 'integer', required: true },
          names: { type: 'array', items: { type: 'string' }, required: true },
          collisions: { type: 'array', items: { type: 'string' }, required: true },
          source: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      capabilities: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', required: true },
            label: { type: 'string', required: true },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };

  function renderStatus(value) {
    const lines = [`DingTalk personal connection: ${value.phase}`];
    if (value.authorizeUrl !== null && value.phase === 'authorizing') {
      lines.push(`Ask the user to open this one-click DingTalk authorization link: ${value.authorizeUrl}`);
    }
    if (value.message !== null) lines.push(value.message);
    lines.push(`DWS installed: ${value.installed}, authorized: ${value.authenticated}`);
    if (value.userName !== null || value.corpName !== null) {
      lines.push(`Account: ${value.userName ?? 'unknown'} · Organization: ${value.corpName ?? 'unknown'}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  }

  ctx.tools.register(defineTool({
    name: 'dingtalk_connect',
    description: 'Default connection tool for an unqualified request such as “帮我连接钉钉”. Connects a '
      + 'DingTalk personal account through the official DWS device authorization flow without asking the user '
      + 'to choose an account type. '
      + 'Returns a complete one-click login.dingtalk.com link; show it to the user, then call dingtalk_status '
      + 'until connected. Reuses an existing valid login unless force=true.',
    parameters: {
      force: {
        type: 'boolean',
        description: 'Start authorization again to change or refresh the DingTalk account.',
      },
    },
    output: { schema: statusOutput, render: (_args, value) => renderStatus(value) },
    async execute(args) {
      startConnect(args.force ?? false);
      for (let index = 0; index < 100
        && state.phase === 'preparing' && state.authorizeUrl === null; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return settingsStatus();
    },
  }));

  ctx.tools.register(defineTool({
    name: 'dingtalk_status',
    description: 'Check DingTalk personal authorization progress. After dingtalk_connect, wait for a new phase '
      + 'and relay the one-click authorization link to the user. Read-only.',
    parameters: {
      wait_seconds: { type: 'integer', description: 'Maximum wait time in seconds (default 20, max 120).' },
    },
    output: { schema: statusOutput, render: (_args, value) => renderStatus(value) },
    async execute(args, exec) {
      const waitMs = Math.min(Math.max(args.wait_seconds ?? 20, 0), 120) * 1000;
      if (waitMs > 0 && (state.phase === 'preparing' || state.phase === 'authorizing')) {
        await new Promise((resolve) => {
          const wake = () => {
            clearTimeout(timer);
            phaseWaiters.delete(wake);
            exec.signal.removeEventListener('abort', wake);
            resolve();
          };
          const timer = setTimeout(wake, waitMs);
          phaseWaiters.add(wake);
          exec.signal.addEventListener('abort', wake, { once: true });
        });
      }
      return settingsStatus(exec.signal);
    },
  }));

  ctx.tools.register(defineTool({
    name: 'dws',
    description: 'Run one official DingTalk Workspace CLI business command. Commands in installed dingtalk-* '
      + 'Skills must be passed as an argv array to this tool. Authentication, upgrade, plugin, skill, config, '
      + 'and secret-bearing flags are blocked. Set confirmed=true only after the user explicitly approves the '
      + 'specific write or destructive operation; the wrapper then supplies --yes.',
    parameters: {
      args: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'DWS argv without the executable name, for example ["todo", "list", "--format", "json"].',
      },
      confirmed: {
        type: 'boolean',
        description: 'Whether the user explicitly confirmed this exact write/destructive operation.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          exitCode: { type: 'integer', required: true },
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.stdout || value.stderr || 'DWS command completed.' }],
    },
    async execute(args, exec) {
      return dws.execute(args.args, { signal: exec.signal, confirmed: args.confirmed === true });
    },
  }));

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'dsh-connect:dingtalk-workspace',
      order: 116,
      text: `${DINGTALK_INTENT_ROUTING_PROMPT} For DingTalk business operations, follow the installed dingtalk-* Skill. Execute every command `
        + 'shown by those Skills through the registered dws tool as an argv array, without a shell. Never add '
        + '--yes yourself; set confirmed=true only after the user explicitly confirms that exact write or '
        + 'destructive action. Use dingtalk_connect when personal authorization is missing.',
    });
  });

  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'dingtalk-connect',
      description: '连接或重新授权钉钉个人账号。',
      input: { hint: '[force]' },
      async handler({ rawInput }) {
        startConnect(rawInput.trim().toLowerCase() === 'force');
        for (let index = 0; index < 100
          && state.phase === 'preparing' && state.authorizeUrl === null; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const status = await settingsStatus();
        const text = renderStatus(status).map((block) => block.text).join('\n');
        return { kind: status.phase === 'error' ? 'error' : 'success', text };
      },
    });
    commandCtx.commands.register({
      name: 'dingtalk-status',
      description: '查看钉钉个人授权状态。',
      async handler() {
        const text = renderStatus(await settingsStatus()).map((block) => block.text).join('\n');
        return { kind: 'success', text };
      },
    });
    commandCtx.commands.register({
      name: 'dingtalk-skills-refresh',
      description: '刷新官方 DWS 与 dingtalk-* Skills。',
      async handler() {
        try {
          await dws.provision();
          const result = await ensureSkills(true);
          return {
            kind: 'success',
            text: `已安装 ${result.count} 个钉钉 Skills（${result.version}）。`,
          };
        } catch (error) {
          return { kind: 'error', text: errorText(error) };
        }
      },
    });
  });

  ctx.inject(['connection'], (uiCtx) => {
    uiCtx.effect(() => uiCtx.connection.rpc.handle(
      '/tokens-dingtalk-workspace',
      async (endpoint, payload) => {
        if (endpoint === 'dingtalk/status') return { ok: true, value: await settingsStatus() };
        if (endpoint === 'dingtalk/connect') {
          if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
            || Object.keys(payload).some((key) => key !== 'force')
            || (payload.force !== undefined && typeof payload.force !== 'boolean')) {
            return {
              ok: false,
              error: { code: 'bad-request', message: 'invalid DingTalk connect request', details: {} },
            };
          }
          startConnect(payload.force === true);
          return { ok: true, value: await settingsStatus() };
        }
        if (endpoint === 'dingtalk/disconnect') {
          if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
            || Object.keys(payload).length !== 1 || payload.confirm !== true) {
            return {
              ok: false,
              error: { code: 'bad-request', message: 'invalid DingTalk disconnect request', details: {} },
            };
          }
          return { ok: true, value: await disconnect() };
        }
        return {
          ok: false,
          error: { code: 'internal', message: `unknown endpoint ${endpoint}`, details: {} },
        };
      },
      { authority: 'trusted-host' },
    ), 'dingtalk-personal: settings rpc channel');
  });
}
