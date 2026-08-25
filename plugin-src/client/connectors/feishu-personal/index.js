import * as React from 'react';

import { FeishuLogoGlyph } from '../../channel-logos.js';
import { h } from '../../i18n.js';
import {
  connectFeishuPersonal,
  fetchFeishuPersonalStatus,
} from './api.js';

const PHASE_TEXT = Object.freeze({
  idle: '未连接',
  creating: '正在创建应用',
  authorizing: '等待个人授权',
  connected: '已连接',
  error: '连接失败',
});

const CAPABILITIES = Object.freeze([
  { name: '创建飞书文档', tool: 'feishu_create_doc' },
  { name: '发送飞书消息', tool: 'feishu_send_message' },
  { name: '创建多维表格', tool: 'feishu_create_bitable' },
  { name: '官方 Lark Skills', tool: 'lark-*' },
]);

export function safeFeishuPersonalHref(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function statusMessage(status) {
  if (!status) return '正在读取本机连接状态';
  if (typeof status.message === 'string' && status.message.trim()) return status.message;
  if (status.phase === 'connected') {
    return status.userName ? `已授权账号：${status.userName}` : '个人账号已授权，可以使用飞书能力。';
  }
  if (status.appConfigured && !status.userAuthorized) return '应用已创建，继续完成个人授权即可。';
  return '创建企业自建应用并完成个人授权。';
}

function HealthItem({ enabled, title, detail }) {
  return h('div', { className: 'dfp-healthItem', 'data-on': String(enabled) },
    h('span', { className: 'dfp-healthDot', 'aria-hidden': 'true' }),
    h('span', null, h('strong', null, title), h('small', null, detail)));
}

export function FeishuPersonalSettings({ rpcCall }) {
  const [status, setStatus] = React.useState();
  const [error, setError] = React.useState();
  const [busy, setBusy] = React.useState();
  const [domain, setDomain] = React.useState('feishu');
  const [tab, setTab] = React.useState('connection');

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setBusy('load');
    try {
      setStatus(await fetchFeishuPersonalStatus(rpcCall));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!quiet) setBusy(undefined);
    }
  }, [rpcCall]);

  const beginConnect = React.useCallback(async (force) => {
    setBusy('connect');
    try {
      setStatus(await connectFeishuPersonal(rpcCall, { domain, force }));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  }, [domain, rpcCall]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (status?.phase !== 'creating' && status?.phase !== 'authorizing') return undefined;
    const timer = setInterval(() => { void load(true); }, 1500);
    return () => clearInterval(timer);
  }, [load, status?.phase]);

  const phase = status?.phase ?? 'idle';
  const connected = phase === 'connected' && status?.userAuthorized === true;
  const connecting = phase === 'creating' || phase === 'authorizing';
  const actionHref = phase === 'creating'
    ? safeFeishuPersonalHref(status?.qrUrl)
    : phase === 'authorizing'
      ? safeFeishuPersonalHref(status?.authorizeUrl)
      : undefined;

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
        enabled: status?.appConfigured === true,
        title: '应用凭据',
        detail: status?.appConfigured === true ? '已安全保存' : '尚未创建',
      }),
      h(HealthItem, {
        enabled: status?.userAuthorized === true,
        title: '个人授权',
        detail: status?.userAuthorized === true ? '授权有效' : '尚未授权',
      }),
      h(HealthItem, {
        enabled: connected,
        title: '飞书能力',
        detail: connected ? '可以使用' : '等待连接',
      })),
    h('div', { className: 'dfp-tabs', role: 'tablist', 'aria-label': '飞书个人账号设置视图' },
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': tab === 'connection',
        onClick: () => setTab('connection'),
      }, '连接与授权'),
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': tab === 'capabilities',
        onClick: () => setTab('capabilities'),
      }, '能力与权限')),
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
                    disabled: busy !== undefined, onClick: () => { void beginConnect(false); },
                  }, busy === 'connect' ? '正在启动...' : status?.appConfigured ? '继续授权' : '一键连接')
                : null,
              connected
                ? h('button', {
                    className: 'dfp-button', type: 'button', disabled: busy !== undefined,
                    onClick: () => { void beginConnect(true); },
                  }, busy === 'connect' ? '正在启动...' : '重新授权')
                : null,
              h('button', {
                className: 'dfp-button', type: 'button', disabled: busy !== undefined,
                onClick: () => { void load(); },
              }, busy === 'load' ? '刷新中...' : '刷新状态'))),
          h('section', { className: 'dfp-section' },
            h('div', { className: 'dfp-sectionHead' },
              h('div', null, h('h3', null, '本机连接'), h('p', null, '不展示 App Secret 或个人令牌'))),
            h('dl', { className: 'dfp-detailList' },
              h('div', null, h('dt', null, '应用'), h('dd', null, status?.appConfigured ? status.appName : '未配置')),
              h('div', null, h('dt', null, '个人账号'), h('dd', null,
                status?.userAuthorized ? status.userName ?? '已授权账号' : '未授权')),
              h('div', null, h('dt', null, '本机配置'), h('dd', null,
                h('code', null, status?.profile ?? 'dsh-feishu'))))))
      : h('div', { className: 'dfp-tabPanel', role: 'tabpanel' },
          h('section', { className: 'dfp-section' },
            h('div', { className: 'dfp-sectionHead' },
              h('div', null, h('h3', null, '可用能力'), h('p', null, '连接后，Agent 可以按需调用这些飞书工具'))),
            h('div', { className: 'dfp-capabilityList' }, CAPABILITIES.map((capability) =>
              h('div', { className: 'dfp-capability', key: capability.tool },
                h('span', { className: 'dfp-capabilityMark', 'data-on': String(connected) }, connected ? '✓' : '·'),
                h('span', null, h('strong', null, capability.name), h('code', null, capability.tool)),
                h('small', null, connected ? '可用' : '连接后启用'))))),
          h('section', { className: 'dfp-section' },
            h('div', { className: 'dfp-sectionHead' },
              h('div', null, h('h3', null, '授权状态'), h('p', null, '首次创建应用时会预填所需的租户和个人权限'))),
            h('div', { className: 'dfp-permissionSummary' },
              h('span', { 'data-on': String(status?.appConfigured === true) }, '应用权限'),
              h('span', { 'data-on': String(status?.userAuthorized === true) }, '个人权限'),
              h('span', { 'data-on': String(connected) }, '官方 Skills')))));
}
