import * as React from 'react';

import { DingtalkLogoGlyph } from '../../channel-logos.js';
import { h } from '../../i18n.js';
import {
  connectDingtalkPersonal,
  disconnectDingtalkPersonal,
  fetchDingtalkPersonalStatus,
} from './api.js';

export const DINGTALK_PERSONAL_STATUS_CACHE_TTL_MS = 15_000;

let statusCache;
let statusCachedAt = 0;
let preloadInFlight;

export function cachedDingtalkPersonalStatus() {
  return statusCache;
}

export function cacheDingtalkPersonalStatus(_rpcCall, status) {
  statusCache = status;
  statusCachedAt = Date.now();
  return status;
}

export function clearDingtalkPersonalStatusCache() {
  statusCache = undefined;
  statusCachedAt = 0;
  preloadInFlight = undefined;
}

export function isDingtalkPersonalStatusCacheFresh(now = Date.now()) {
  return statusCache !== undefined
    && now - statusCachedAt <= DINGTALK_PERSONAL_STATUS_CACHE_TTL_MS;
}

export function preloadDingtalkPersonalStatus(rpcCall, { refresh = false } = {}) {
  if (!refresh && isDingtalkPersonalStatusCacheFresh()) return Promise.resolve(statusCache);
  if (!refresh && preloadInFlight !== undefined) return preloadInFlight;
  const request = fetchDingtalkPersonalStatus(rpcCall)
    .then((status) => cacheDingtalkPersonalStatus(rpcCall, status))
    .finally(() => {
      if (preloadInFlight === request) preloadInFlight = undefined;
    });
  preloadInFlight = request;
  return request;
}

export function safeDingtalkPersonalHref(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'login.dingtalk.com'
      || url.pathname !== '/oauth2/device/verify.htm') return undefined;
    const code = url.searchParams.get('user_code');
    if ([...url.searchParams.keys()].length !== 1
      || code === null || !/^[A-Z0-9]{4,12}(?:-[A-Z0-9]{2,12})+$/.test(code)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function deriveDingtalkPersonalView(status) {
  if (status === undefined) {
    return { phase: 'loading', connected: false, connecting: false, actionHref: undefined };
  }
  const connected = status.authenticated === true;
  const phase = connected ? 'connected' : status.phase ?? 'idle';
  const connecting = !connected && (phase === 'preparing' || phase === 'authorizing');
  const actionHref = phase === 'authorizing'
    ? safeDingtalkPersonalHref(status.authorizeUrl)
    : undefined;
  return { phase, connected, connecting, actionHref };
}

const PHASE_LABELS = Object.freeze({
  loading: '读取中',
  idle: '未连接',
  preparing: '准备中',
  authorizing: '等待授权',
  connected: '已连接',
  error: '连接异常',
});

function HealthItem({ active, title, detail }) {
  return h('div', { className: 'ddp-healthItem', 'data-active': String(active) },
    h('span', { className: 'ddp-dot', 'aria-hidden': 'true' }),
    h('span', null, h('strong', null, title), h('small', null, detail)));
}

function ConnectionPanel({ status, busy, connected, connecting, actionHref, onConnect, onDisconnect, onRefresh }) {
  return h('div', { className: 'ddp-tabPanel', role: 'tabpanel' },
    h('section', { className: 'ddp-section' },
      h('div', { className: 'ddp-sectionHead' },
        h('div', null,
          h('h3', null, connected ? '个人连接' : '接入方式'),
          h('p', null, status?.message ?? '通过钉钉官方 DWS 完成个人账号授权。'))),
      actionHref
        ? h('div', { className: 'ddp-authAction' },
            h('span', { className: 'ddp-authIcon', 'aria-hidden': 'true' }, '1'),
            h('span', null,
              h('strong', null, '确认钉钉个人授权'),
              h('small', null, '链接已包含授权码，无需手动输入')),
            h('a', {
              href: actionHref,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, '打开钉钉授权页面', h('span', { 'aria-hidden': 'true' }, '↗')))
        : null,
      h('div', { className: 'ddp-actions' },
        !connected && !connecting
          ? h('button', {
              type: 'button',
              className: 'ddp-button',
              'data-kind': 'primary',
              disabled: busy !== undefined,
              onClick: () => onConnect(false),
            }, busy === 'connect' ? '正在启动...' : '一键授权钉钉')
          : null,
        connected
          ? h('button', {
              type: 'button',
              className: 'ddp-button',
              disabled: busy !== undefined,
              onClick: () => onConnect(true),
            }, busy === 'connect' ? '正在启动...' : '重新授权')
          : null,
        connected
          ? h('button', {
              type: 'button',
              className: 'ddp-button',
              'data-kind': 'danger',
              disabled: busy !== undefined,
              onClick: onDisconnect,
            }, busy === 'disconnect' ? '正在解除...' : '解除授权')
          : null,
        h('button', {
          type: 'button',
          className: 'ddp-button',
          disabled: busy !== undefined,
          onClick: onRefresh,
        }, busy === 'load' ? '刷新中...' : '刷新状态'))),
    h('section', { className: 'ddp-section' },
      h('div', { className: 'ddp-sectionHead' },
        h('div', null,
          h('h3', null, '本机连接'),
          h('p', null, '使用官方托管 OAuth，不需要填写 AppKey 或 AppSecret'))),
      h('dl', { className: 'ddp-detailList' },
        h('div', null, h('dt', null, '个人账号'), h('dd', null, status?.userName ?? '未授权')),
        h('div', null, h('dt', null, '所属组织'), h('dd', null, status?.corpName ?? '未读取')),
        h('div', null, h('dt', null, 'DWS 版本'), h('dd', null,
          status?.installed ? status.version ?? '已安装' : '首次授权时自动安装')),
        h('div', null, h('dt', null, '令牌续期'), h('dd', null,
          status?.refreshTokenValid ? '刷新令牌有效，DWS 自动续期' : connected ? '需要重新授权' : '未连接')))));
}

function CapabilitiesPanel({ status }) {
  const capabilities = Array.isArray(status?.capabilities) ? status.capabilities : [];
  const skills = status?.skills;
  return h('div', { className: 'ddp-tabPanel', role: 'tabpanel' },
    h('section', { className: 'ddp-section' },
      h('div', { className: 'ddp-sectionHead' },
        h('div', null,
          h('h3', null, '已安装业务能力'),
          h('p', null, skills?.available
            ? `${skills.count} 个官方 Skills · DWS ${skills.version ?? status?.version ?? ''}`
            : '连接后自动安装官方 dingtalk-* Skills'))),
      capabilities.length > 0
        ? h('div', { className: 'ddp-capabilityGrid' }, capabilities.map((capability) =>
            h('div', { className: 'ddp-capability', key: capability.id },
              h('span', { className: 'ddp-capabilityCheck', 'aria-hidden': 'true' }, '✓'),
              h('span', null, h('strong', null, capability.label), h('code', null, capability.id)))))
        : h('div', { className: 'ddp-empty' }, connected ? '正在准备官方业务 Skills' : '完成个人授权后显示实际安装能力'),
      Array.isArray(skills?.collisions) && skills.collisions.length > 0
        ? h('div', { className: 'ddp-warning' },
            `检测到 ${skills.collisions.length} 个同名自定义 Skill，已保留原目录且未覆盖。`)
        : null,
      h('p', { className: 'ddp-source' }, '能力清单来自本机已校验安装的 DWS Skills，不是界面预设权限。')));
}

export function DingtalkPersonalSettings({ rpcCall }) {
  const initial = cachedDingtalkPersonalStatus();
  const [status, setStatus] = React.useState(initial);
  const [busy, setBusy] = React.useState(initial === undefined ? 'load' : undefined);
  const [error, setError] = React.useState();
  const [tab, setTab] = React.useState('connection');

  const commit = React.useCallback((next) => {
    cacheDingtalkPersonalStatus(rpcCall, next);
    setStatus(next);
  }, [rpcCall]);

  const load = React.useCallback(async (quiet = false, refresh = true) => {
    if (!quiet) setBusy('load');
    try {
      commit(await preloadDingtalkPersonalStatus(rpcCall, { refresh }));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!quiet) setBusy(undefined);
    }
  }, [commit, rpcCall]);

  const connect = React.useCallback(async (force) => {
    setBusy('connect');
    try {
      commit(await connectDingtalkPersonal(rpcCall, { force }));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }, [commit, rpcCall]);

  const disconnect = React.useCallback(async () => {
    setBusy('disconnect');
    try {
      commit(await disconnectDingtalkPersonal(rpcCall));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }, [commit, rpcCall]);

  React.useEffect(() => {
    if (initial === undefined) void load(false, false);
    else if (!isDingtalkPersonalStatusCacheFresh()) void load(true, true);
  }, [initial, load]);

  const { phase, connected, connecting, actionHref } = deriveDingtalkPersonalView(status);
  React.useEffect(() => {
    if (!connecting) return undefined;
    const timer = setInterval(() => { void load(true, true); }, 1500);
    return () => clearInterval(timer);
  }, [connecting, load]);

  return h('section', { className: 'ddp-page', 'aria-label': '钉钉个人账号设置' },
    h('header', { className: 'ddp-serviceHead' },
      h('span', { className: 'ddp-serviceLogo', 'aria-hidden': 'true' }, h(DingtalkLogoGlyph)),
      h('span', { className: 'ddp-serviceCopy' },
        h('strong', null, '钉钉个人账号'),
        h('small', null, 'DingTalk Workspace')),
      h('span', { className: 'ddp-badge', 'data-phase': phase }, PHASE_LABELS[phase] ?? PHASE_LABELS.idle)),
    error ? h('div', { className: 'ddp-notice', role: 'alert' }, error) : null,
    h('div', { className: 'ddp-health', 'aria-label': '钉钉个人连接状态' },
      h(HealthItem, {
        active: status?.installed === true,
        title: '官方组件',
        detail: status?.installed ? `DWS ${status.version ?? '已安装'}` : '按需校验安装',
      }),
      h(HealthItem, {
        active: connected,
        title: '个人授权',
        detail: connected ? status?.userName ?? '已授权' : connecting ? '等待完成' : '尚未授权',
      }),
      h(HealthItem, {
        active: status?.skills?.available === true,
        title: '业务 Skills',
        detail: status?.skills?.available ? `${status.skills.count} 个已安装` : '连接后自动安装',
      })),
    h('div', { className: 'ddp-tabs', role: 'tablist', 'aria-label': '钉钉个人账号设置视图' },
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': tab === 'connection',
        onClick: () => setTab('connection'),
      }, '连接与授权'),
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': tab === 'capabilities',
        onClick: () => setTab('capabilities'),
      }, '业务能力')),
    tab === 'connection'
      ? h(ConnectionPanel, {
          status,
          busy,
          connected,
          connecting,
          actionHref,
          onConnect: (force) => { void connect(force); },
          onDisconnect: () => { void disconnect(); },
          onRefresh: () => { void load(false, true); },
        })
      : h(CapabilitiesPanel, { status }));
}
