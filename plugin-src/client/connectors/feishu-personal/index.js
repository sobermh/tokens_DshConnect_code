import * as React from 'react';

import { FeishuLogoGlyph } from '../../channel-logos.js';
import { h } from '../../i18n.js';
import {
  connectFeishuPersonal,
  disconnectFeishuPersonal,
  fetchFeishuPersonalStatus,
} from './api.js';

const PHASE_TEXT = Object.freeze({
  loading: '正在读取',
  idle: '未连接',
  creating: '正在创建应用',
  authorizing: '等待个人授权',
  connected: '已连接',
  error: '连接失败',
});

export const FEISHU_PERSONAL_STATUS_CACHE_TTL_MS = 60_000;

let statusCache;
let statusCachedAt = 0;
let statusCacheRevision = 0;
let statusRequest;

export function cachedFeishuPersonalStatus() {
  return statusCache;
}

export function cacheFeishuPersonalStatus(_rpcCall, status) {
  statusCache = status;
  statusCachedAt = Date.now();
  statusCacheRevision += 1;
  return status;
}

export function isFeishuPersonalStatusCacheFresh(now = Date.now()) {
  return statusCache !== undefined
    && now - statusCachedAt < FEISHU_PERSONAL_STATUS_CACHE_TTL_MS;
}

export function clearFeishuPersonalStatusCache() {
  statusCache = undefined;
  statusCachedAt = 0;
  statusCacheRevision += 1;
  statusRequest = undefined;
}

export function preloadFeishuPersonalStatus(rpcCall, { refresh = false } = {}) {
  if (statusRequest) return statusRequest;
  const cached = cachedFeishuPersonalStatus();
  if (!refresh && cached !== undefined) return Promise.resolve(cached);
  const revision = statusCacheRevision;
  const request = fetchFeishuPersonalStatus(rpcCall)
    .then((status) => {
      if (statusCacheRevision !== revision && statusCache !== undefined) return statusCache;
      return cacheFeishuPersonalStatus(rpcCall, status);
    })
    .finally(() => {
      if (statusRequest === request) statusRequest = undefined;
    });
  statusRequest = request;
  return request;
}

export function safeFeishuPersonalHref(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function deriveFeishuPersonalView(status) {
  if (!status) {
    return { phase: 'loading', connected: false, connecting: false, actionHref: undefined };
  }
  const connected = status?.userAuthorized === true;
  const phase = connected ? 'connected' : status?.phase ?? 'idle';
  const connecting = !connected && (phase === 'creating' || phase === 'authorizing');
  const actionHref = !connected && phase === 'creating'
    ? safeFeishuPersonalHref(status?.qrUrl)
    : !connected && phase === 'authorizing'
      ? safeFeishuPersonalHref(status?.authorizeUrl)
      : undefined;
  return { phase, connected, connecting, actionHref };
}

export function statusMessage(status) {
  if (!status) return '正在读取本机连接状态';
  if (status.userAuthorized === true) {
    return status.userName ? `已授权账号：${status.userName}` : '个人账号已授权，可以使用飞书能力。';
  }
  if (typeof status.message === 'string' && status.message.trim()) return status.message;
  if (status.selectionRequired) return '检测到多个飞书应用，请选择本次个人授权使用的应用。';
  if (Array.isArray(status.applications) && status.applications.length > 0) {
    return '已有飞书应用可以复用，也可以创建新的独立应用。';
  }
  if (status.appConfigured && !status.userAuthorized) return '应用已创建，继续完成个人授权即可。';
  return '创建企业自建应用并完成个人授权。';
}

function HealthItem({ enabled, title, detail }) {
  return h('div', { className: 'dfp-healthItem', 'data-on': String(enabled) },
    h('span', { className: 'dfp-healthDot', 'aria-hidden': 'true' }),
    h('span', null, h('strong', null, title), h('small', null, detail)));
}

export function CapabilityPanel({ status }) {
  const authorization = status?.authorization;
  const scopes = authorization?.scopes;
  const domains = Array.isArray(scopes?.domains) ? scopes.domains : [];
  const scopeValues = Array.isArray(scopes?.values) ? scopes.values : [];
  const applicationScopes = authorization?.applicationScopes;
  const applicationDomains = Array.isArray(applicationScopes?.domains) ? applicationScopes.domains : [];
  const applicationScopeValues = Array.isArray(applicationScopes?.values) ? applicationScopes.values : [];
  const pendingApplicationScopeValues = Array.isArray(applicationScopes?.pendingValues)
    ? applicationScopes.pendingValues
    : [];
  const appIdentity = authorization?.appIdentity;
  const personalIdentity = authorization?.personalIdentity;
  const skills = authorization?.skills;
  const skillsDetail = skills?.available === true
    ? [`${skills.count} 个已安装`, skills.version].filter(Boolean).join(' · ')
    : '本机 Skills 清单不可用';
  return h('div', { className: 'dfp-tabPanel', role: 'tabpanel' },
    h('section', { className: 'dfp-section' },
      h('div', { className: 'dfp-sectionHead' },
        h('div', null,
          h('h3', null, '实际权限'),
          h('p', null, status?.checkedAt ? `最近检查：${new Date(status.checkedAt).toLocaleString()}` : '尚未完成实时检查'))),
      h('div', { className: 'dfp-evidenceList' },
        h('div', { className: 'dfp-evidence', 'data-on': String(appIdentity?.verified === true) },
          h('span', { className: 'dfp-healthDot', 'aria-hidden': 'true' }),
          h('span', null,
            h('strong', null, '应用身份'),
            h('small', null, appIdentity?.verified === true
              ? '机器人凭据已通过飞书服务端验证'
              : appIdentity?.available === true ? '机器人凭据可用，未完成实时验证' : '机器人凭据不可用'),
            h('code', null, authorization?.source ?? 'lark-cli auth status'))),
        h('div', { className: 'dfp-evidence', 'data-on': String(personalIdentity?.verified === true) },
          h('span', { className: 'dfp-healthDot', 'aria-hidden': 'true' }),
          h('span', null,
            h('strong', null, '个人身份'),
            h('small', null, personalIdentity?.verified === true
              ? `Token ${personalIdentity.tokenStatus ?? 'valid'} · 服务端验证通过`
              : personalIdentity?.available === true ? `Token ${personalIdentity.tokenStatus ?? '可用'}` : '个人授权不可用'),
            h('code', null, authorization?.source ?? 'lark-cli auth status'))),
        h('div', { className: 'dfp-evidence', 'data-on': String(applicationScopes?.available === true) },
          h('span', { className: 'dfp-healthDot', 'aria-hidden': 'true' }),
          h('span', null,
            h('strong', null, '实际应用权限'),
            h('small', null, applicationScopes?.available === true
              ? `${applicationScopes.count ?? 0} 项已授权 · ${applicationScopes.pendingCount ?? 0} 项待生效`
              : '暂时无法读取应用权限'),
            h('code', null, applicationScopes?.source ?? 'GET /open-apis/application/v6/scopes'))),
        h('div', { className: 'dfp-evidence', 'data-on': String((scopes?.count ?? 0) > 0) },
          h('span', { className: 'dfp-healthDot', 'aria-hidden': 'true' }),
          h('span', null,
            h('strong', null, '实际个人权限'),
            h('small', null, `${scopes?.count ?? 0} 项权限 · ${domains.length} 个能力域`),
            h('code', null, authorization?.source ?? 'lark-cli auth status'))),
        h('div', { className: 'dfp-evidence', 'data-on': String(skills?.available === true) },
          h('span', { className: 'dfp-healthDot', 'aria-hidden': 'true' }),
          h('span', null,
            h('strong', null, '官方 Lark Skills'),
            h('small', null, skillsDetail),
            h('code', null, skills?.source ?? '~/.dsh/skills/.lark-skills.json')))),
      applicationDomains.length > 0
        ? h('div', { className: 'dfp-scopeGroup' },
            h('strong', null, '应用权限能力域'),
            h('div', { className: 'dfp-scopeDomains', 'aria-label': '飞书应用权限能力域' }, applicationDomains.map((domainItem) =>
              h('span', { key: domainItem.id }, h('span', null, domainItem.name), ` ${domainItem.count}`))))
        : null,
      applicationScopeValues.length > 0
        ? h('details', { className: 'dfp-scopeDetails' },
            h('summary', null, `查看 ${applicationScopeValues.length} 项实际应用权限`),
            h('div', { className: 'dfp-scopeList' }, applicationScopeValues.map((scope) => h('code', { key: scope }, scope))))
        : null,
      pendingApplicationScopeValues.length > 0
        ? h('details', { className: 'dfp-scopeDetails', 'data-tone': 'warning' },
            h('summary', null, `查看 ${pendingApplicationScopeValues.length} 项待生效应用权限`),
            h('div', { className: 'dfp-scopeList' }, pendingApplicationScopeValues.map((scope) => h('code', { key: scope }, scope))))
        : null,
      domains.length > 0
        ? h('div', { className: 'dfp-scopeGroup' },
            h('strong', null, '个人权限能力域'),
            h('div', { className: 'dfp-scopeDomains', 'aria-label': '飞书个人权限能力域' }, domains.map((domainItem) =>
              h('span', { key: domainItem.id }, h('span', null, domainItem.name), ` ${domainItem.count}`))))
        : null,
      scopeValues.length > 0
        ? h('details', { className: 'dfp-scopeDetails' },
            h('summary', null, `查看 ${scopeValues.length} 项实际个人权限`),
            h('div', { className: 'dfp-scopeList' }, scopeValues.map((scope) => h('code', { key: scope }, scope))))
        : null,
      h('p', { className: 'dfp-evidenceNote' }, '应用权限来自飞书租户授权状态；个人权限来自当前账号 OAuth 授权。')));
}

export function FeishuPersonalSettings({ rpcCall }) {
  const initialStatus = cachedFeishuPersonalStatus();
  const [status, setStatus] = React.useState(initialStatus);
  const [error, setError] = React.useState();
  const [busy, setBusy] = React.useState(initialStatus === undefined ? 'load' : undefined);
  const [domain, setDomain] = React.useState('feishu');
  const [tab, setTab] = React.useState('connection');
  const [applicationChoice, setApplicationChoice] = React.useState('');

  const commitStatus = React.useCallback((next) => {
    cacheFeishuPersonalStatus(rpcCall, next);
    setStatus(next);
    const applications = Array.isArray(next?.applications) ? next.applications : [];
    setApplicationChoice((current) => {
      if (next?.selectedApplicationId) return next.selectedApplicationId;
      if (applications.some((application) => application.applicationId === current)) return current;
      if (current === '__new__') return current;
      if (applications.length === 1) return applications[0].applicationId;
      return applications.length === 0 ? '__new__' : '';
    });
  }, [rpcCall]);

  const load = React.useCallback(async (quiet = false, refresh = true) => {
    if (!quiet) setBusy('load');
    try {
      commitStatus(await preloadFeishuPersonalStatus(rpcCall, { refresh }));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!quiet) setBusy(undefined);
    }
  }, [commitStatus, rpcCall]);

  const beginConnect = React.useCallback(async (force) => {
    setBusy('connect');
    try {
      const createNew = applicationChoice === '__new__';
      commitStatus(await connectFeishuPersonal(rpcCall, {
        domain,
        force,
        ...(createNew ? { createNew: true } : {}),
        ...(!createNew && applicationChoice ? { applicationId: applicationChoice } : {}),
      }));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }, [applicationChoice, commitStatus, domain, rpcCall]);

  const disconnect = React.useCallback(async () => {
    setBusy('disconnect');
    try {
      commitStatus(await disconnectFeishuPersonal(rpcCall));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }, [commitStatus, rpcCall]);

  React.useEffect(() => {
    if (cachedFeishuPersonalStatus() === undefined) {
      void load(false, false);
      return;
    }
    if (!isFeishuPersonalStatusCacheFresh()) void load(true, true);
  }, [load, rpcCall]);
  const { phase, connected, connecting, actionHref } = deriveFeishuPersonalView(status);
  React.useEffect(() => {
    if (!connecting) return undefined;
    const timer = setInterval(() => { void load(true); }, 1500);
    return () => clearInterval(timer);
  }, [connecting, load]);

  const applications = Array.isArray(status?.applications) ? status.applications : [];
  const selectedApplication = status?.selectedApplication ?? applications.find(
    (application) => application.applicationId === status?.selectedApplicationId,
  );
  const choiceRequired = !connected && applications.length > 1 && !applicationChoice;
  const authorization = status?.authorization;
  const scopeCount = authorization?.scopes?.count ?? 0;
  return h('section', { className: 'dfp-page', 'aria-label': '飞书个人账号设置' },
    h('header', { className: 'dfp-serviceHead' },
      h('span', { className: 'dfp-serviceLogo', 'aria-hidden': 'true' }, h(FeishuLogoGlyph)),
      h('span', { className: 'dfp-serviceCopy' },
        h('strong', null, '飞书个人账号'),
        h('small', null, status?.appName ?? 'Tokens 工作助手')),
      h('span', { className: 'dfp-badge', 'data-phase': phase }, PHASE_TEXT[phase] ?? PHASE_TEXT.idle)),
    error ? h('div', { className: 'dfp-notice', 'data-tone': 'error', role: 'alert' }, error) : null,
    h('div', { className: 'dfp-health', 'aria-label': '飞书个人连接状态' },
      h(HealthItem, {
        enabled: authorization?.appIdentity?.verified === true,
        title: '应用身份',
        detail: authorization?.appIdentity?.verified === true
          ? '服务端验证通过'
          : status?.appConfigured === true
            ? '凭据已安全保存'
          : applications.length > 0 ? '已有应用可选' : '尚未创建',
      }),
      h(HealthItem, {
        enabled: authorization?.personalIdentity?.verified === true,
        title: '个人授权',
        detail: authorization?.personalIdentity?.verified === true
          ? '服务端验证通过'
          : status?.userAuthorized === true ? '本机 Token 可用' : '尚未授权',
      }),
      h(HealthItem, {
        enabled: scopeCount > 0,
        title: '实际权限',
        detail: scopeCount > 0 ? `${scopeCount} 项已读取` : connected ? '正在读取' : '等待连接',
      })),
    h('div', { className: 'dfp-tabs', role: 'tablist', 'aria-label': '飞书个人账号设置视图' },
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': tab === 'connection',
        onClick: () => setTab('connection'),
      }, '连接与授权'),
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': tab === 'capabilities',
        onClick: () => setTab('capabilities'),
      }, '权限与组件')),
    tab === 'connection'
      ? h('div', { className: 'dfp-tabPanel', role: 'tabpanel' },
          h('section', { className: 'dfp-section' },
            h('div', { className: 'dfp-sectionHead' },
              h('div', null,
                h('h3', null, connected ? '个人连接' : '接入方式'),
                h('p', null, statusMessage(status)))),
            !connected && !connecting
              ? h('div', { className: 'dfp-domainRow' },
                  h('div', { className: 'dfp-segmented', 'aria-label': '服务区域' },
                    h('button', {
                      type: 'button', 'aria-pressed': domain === 'feishu',
                      onClick: () => setDomain('feishu'),
                    }, '飞书'),
                    h('button', {
                      type: 'button', 'aria-pressed': domain === 'lark',
                      onClick: () => setDomain('lark'),
                    }, 'Lark')),
                  h('span', null, '应用凭据和授权令牌仅保存在本机'))
              : null,
            !connecting
              ? h('div', { className: 'dfp-applicationPicker' },
                  h('label', { htmlFor: 'dfp-feishu-application' },
                    h('strong', null, '飞书应用'),
                    h('small', null, connected
                      ? '切换应用会重新进行个人授权'
                      : '机器人与个人授权可以复用同一个应用')),
                  h('select', {
                    id: 'dfp-feishu-application',
                    value: applicationChoice,
                    disabled: busy !== undefined,
                    onChange: (event) => setApplicationChoice(event.target.value),
                  },
                  applications.length > 1 && !status?.selectedApplicationId
                    ? h('option', { value: '' }, '请选择一个已有应用')
                    : null,
                  applications.map((application) => h('option', {
                    key: application.applicationId,
                    value: application.applicationId,
                  }, `${application.name} · ${application.appIdMasked}${application.botCount > 0 ? ' · 与机器人共用' : ''}`)),
                  h('option', { value: '__new__' }, '创建新的独立应用')),
                  choiceRequired
                    ? h('span', { className: 'dfp-fieldMessage' }, '检测到多个应用，请先选择本次授权使用的应用。')
                    : null)
              : null,
            actionHref
              ? h('div', { className: 'dfp-flowAction' },
                  h('span', { className: 'dfp-flowStep' }, phase === 'creating' ? '1' : '2'),
                  h('span', null,
                    h('strong', null, phase === 'creating' ? '确认创建飞书应用' : '确认个人账号授权'),
                    h('small', null, '完成后此页面会自动更新')),
                  h('a', {
                    href: actionHref, target: '_blank', rel: 'noreferrer noopener',
                  }, phase === 'creating' ? '打开应用创建页面' : '打开个人授权页面',
                  h('span', { 'aria-hidden': 'true' }, '↗')))
              : null,
            h('div', { className: 'dfp-actions' },
              !connected && !connecting
                ? h('button', {
                    className: 'dfp-button', 'data-kind': 'primary', type: 'button',
                    disabled: busy !== undefined || choiceRequired, onClick: () => { void beginConnect(false); },
                  }, busy === 'connect'
                    ? '正在启动...'
                    : applicationChoice === '__new__'
                      ? '创建应用并授权'
                      : status?.appConfigured ? '继续授权' : '使用此应用授权')
                : null,
              connected
                ? h('button', {
                    className: 'dfp-button', type: 'button', disabled: busy !== undefined,
                    onClick: () => { void beginConnect(true); },
                  }, busy === 'connect'
                    ? '正在启动...'
                    : applicationChoice === '__new__'
                      ? '创建并切换'
                      : applicationChoice !== status?.selectedApplicationId
                        ? '切换并授权'
                        : '重新授权')
                : null,
              connected
                ? h('button', {
                    className: 'dfp-button', 'data-kind': 'danger', type: 'button',
                    disabled: busy !== undefined, onClick: () => { void disconnect(); },
                  }, busy === 'disconnect' ? '正在解除...' : '解除个人授权')
                : null,
              h('button', {
                className: 'dfp-button', type: 'button', disabled: busy !== undefined,
                onClick: () => { void load(); },
              }, busy === 'load' ? '刷新中...' : '刷新状态'))),
          h('section', { className: 'dfp-section' },
            h('div', { className: 'dfp-sectionHead' },
              h('div', null, h('h3', null, '本机连接'), h('p', null, '不展示 App Secret 或个人令牌'))),
            h('dl', { className: 'dfp-detailList' },
              h('div', null, h('dt', null, '应用'), h('dd', null,
                selectedApplication
                  ? `${selectedApplication.name} · ${selectedApplication.appIdMasked}`
                  : '未选择')),
              h('div', null, h('dt', null, '使用方式'), h('dd', null,
                selectedApplication?.botCount > 0 ? '与飞书机器人共用' : selectedApplication ? '个人授权独立使用' : '未配置')),
              h('div', null, h('dt', null, '个人账号'), h('dd', null,
                status?.userAuthorized ? status.userName ?? '已授权账号' : '未授权')))))
      : h(CapabilityPanel, { status }));
}
