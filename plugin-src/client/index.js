import * as React from 'react';

import {
  CHANNEL_GROUPS,
  CONNECTION_DEFINITIONS,
  connectionDefinition,
  connectionRpcCallsFromProps,
  createConnectionRpcCalls,
  installConnectionStyles,
  preloadConnectionStatuses,
} from './connection-catalog.js';
import { en, h, IM_LOCALE_NAMESPACE, setImTranslator, zh } from './i18n.js';
import {
  createLoopbackAwareRpcCalls,
  replacePageLocation,
} from './loopback-recovery.js';
import { installImStyles } from './styles.js';
import { installConnectionCenterNavIcon } from './settings-nav-icon.js';
import { WorkspaceDirectoryPickerContext } from './workspace-editor.js';

export const name = 'connect-settings';
export const inject = ['slots', 'connection', 'locale', 'workspaces'];

export { CHANNEL_GROUPS };

const CHANNELS = Object.freeze(CHANNEL_GROUPS.flatMap((group) => group.channels));

function ChannelLogo({ channel }) {
  const definition = connectionDefinition(channel);
  return h('span', {
    className: `dim-logo ${definition.logoClass}`,
    'aria-hidden': 'true',
  }, h(definition.LogoGlyph));
}

function ChannelNavButton({ channel, activeId, onSelect }) {
  return h('button', {
    type: 'button',
    role: 'tab',
    id: `dim-tab-${channel.id}`,
    className: 'dim-channel',
    'aria-selected': channel.id === activeId,
    'aria-controls': `dim-panel-${channel.id}`,
    onClick: () => onSelect(channel.id),
  },
  h(ChannelLogo, { channel: channel.id }),
  h('span', { className: 'dim-channelCopy' },
    h('strong', null, channel.label),
    channel.note ? h('small', { className: 'dim-channelNote' }, channel.note) : null,
  ));
}

export function LoopbackRecoveryNotice({ recovery, onNavigate = replacePageLocation }) {
  return h('div', {
    className: 'dim-loopbackRecovery',
    role: 'alert',
  },
  h('div', { className: 'dim-loopbackRecoveryCopy' },
    h('strong', null, '请改用 localhost 重新打开'),
    h('p', null, '页面会在当前端口重新打开，机器人配置不会改变。'),
    h('code', null, recovery.origin)),
  h('button', {
    type: 'button',
    className: 'dim-loopbackRecoveryAction',
    onClick: () => onNavigate(recovery.url),
  }, '使用 localhost 重新打开'));
}

export function IMSettingsTab(props) {
  const {
    workspaceDirectoryPicker,
    browserLocation = globalThis.location,
    navigateToRecoveryUrl = replacePageLocation,
  } = props;
  const [selected, setSelected] = React.useState('weixin');
  const [activeGroupId, setActiveGroupId] = React.useState(CHANNEL_GROUPS[0].id);
  const [loopbackRecovery, setLoopbackRecovery] = React.useState(null);
  const githubTooltipId = React.useId();
  const groupTabsId = React.useId();
  const groupTabRefs = React.useRef([]);
  const active = CHANNELS.find((channel) => channel.id === selected) ?? CHANNELS[0];
  const activeDefinition = connectionDefinition(active.id);
  const activeGroup = CHANNEL_GROUPS.find((group) => group.id === activeGroupId) ?? CHANNEL_GROUPS[0];
  const selectGroup = React.useCallback((group) => {
    setActiveGroupId(group.id);
    setSelected((current) => group.channels.some((channel) => channel.id === current)
      ? current
      : group.channels[0].id);
  }, []);
  const onGroupTabKeyDown = React.useCallback((event, index) => {
    let nextIndex;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + CHANNEL_GROUPS.length) % CHANNEL_GROUPS.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % CHANNEL_GROUPS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = CHANNEL_GROUPS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectGroup(CHANNEL_GROUPS[nextIndex]);
    groupTabRefs.current[nextIndex]?.focus();
  }, [selectGroup]);
  const reportLoopbackRecovery = React.useCallback((recovery) => {
    setLoopbackRecovery((current) => current?.url === recovery.url ? current : recovery);
  }, []);
  const rpcDependencies = CONNECTION_DEFINITIONS.map(({ rpcKey }) => props[rpcKey]);
  const rpcCalls = React.useMemo(() => createLoopbackAwareRpcCalls(
    connectionRpcCallsFromProps(props), {
    location: browserLocation,
    onRecovery: reportLoopbackRecovery,
  }), [
    browserLocation,
    reportLoopbackRecovery,
    ...rpcDependencies,
  ]);
  React.useEffect(() => {
    preloadConnectionStatuses(rpcCalls);
  }, [rpcCalls]);
  return h(WorkspaceDirectoryPickerContext.Provider, { value: workspaceDirectoryPicker },
    h('section', { className: 'dim-page', 'aria-label': '连接中心设置' },
    h('header', { className: 'dim-title' },
      h('div', { className: 'dim-brand' },
        h('strong', { className: 'dim-brandName' }, '连接中心'),
        h('p', null, '统一管理 IM 机器人与应用授权')),
      h('span', { className: 'dim-githubAction' },
        h('a', {
          className: 'dim-githubLink',
          href: 'https://github.com/sobermh/tokens_DshConnect_code',
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': '连接中心 GitHub',
          'aria-describedby': githubTooltipId,
        },
        h('span', null, 'GitHub'),
        h('span', { className: 'dim-githubArrow', 'aria-hidden': 'true' }, '↗')),
        h('span', {
          id: githubTooltipId,
          className: 'dim-githubTooltip',
          role: 'tooltip',
        }, '帮助与反馈 · 前往 GitHub')),
    ),
    h('div', { className: 'dim-modeTabs', role: 'tablist', 'aria-label': '连接类型' },
      CHANNEL_GROUPS.map((group, index) => h('button', {
        key: group.id,
        ref: (element) => {
          groupTabRefs.current[index] = element;
        },
        id: `${groupTabsId}-tab-${group.id}`,
        type: 'button',
        role: 'tab',
        className: 'dim-modeTab',
        'aria-label': group.label,
        'aria-selected': activeGroup.id === group.id,
        'aria-controls': `${groupTabsId}-panel`,
        'data-active': activeGroup.id === group.id ? 'true' : undefined,
        tabIndex: activeGroup.id === group.id ? 0 : -1,
        onClick: () => selectGroup(group),
        onKeyDown: (event) => onGroupTabKeyDown(event, index),
      }, group.label))),
    h('div', {
      className: 'dim-modePanel',
      id: `${groupTabsId}-panel`,
      role: 'tabpanel',
      'aria-labelledby': `${groupTabsId}-tab-${activeGroup.id}`,
    },
    h('div', { className: 'dim-layout' },
      h('nav', { className: 'dim-rail', role: 'tablist', 'aria-label': activeGroup.label },
        h('div', {
          key: activeGroup.id,
          className: 'dim-channelGroup',
          role: 'presentation',
        },
        activeGroup.channels.map((channel) => h(ChannelNavButton, {
          key: channel.id,
          channel,
          activeId: active.id,
          onSelect: setSelected,
        })))),
      h('div', { className: 'dim-divider', 'aria-hidden': 'true' }),
      h('main', {
        className: 'dim-panel',
        role: 'tabpanel',
        id: `dim-panel-${active.id}`,
        'aria-labelledby': `dim-tab-${active.id}`,
      },
      loopbackRecovery
        ? h(LoopbackRecoveryNotice, {
            recovery: loopbackRecovery,
            onNavigate: navigateToRecoveryUrl,
          })
        : null,
      h(activeDefinition.Component, {
        rpcCall: rpcCalls[activeDefinition.rpcKey],
      }),
    ),
    ),
    ),
  ));
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(IM_LOCALE_NAMESPACE, { zh, en }),
    'im-settings: bilingual dictionaries',
  );
  const t = ctx.locale.bind(IM_LOCALE_NAMESPACE);
  setImTranslator(t);
  ctx.effect(
    () => installConnectionCenterNavIcon(),
    'dsh-connect: replace the fallback settings navigation icon',
  );

  ctx.effect(() => {
    const disposeConnectionStyles = installConnectionStyles();
    const disposeBaseStyles = installImStyles();
    return () => {
      disposeBaseStyles();
      disposeConnectionStyles();
    };
  }, 'im-settings: install combined channel styles');

  const rpcCalls = createConnectionRpcCalls(ctx.connection);
  const workspaceDirectoryPicker = Object.freeze({
    listDirectory: (path, signal) => ctx.workspaces.listDirectory(path, signal),
    pickDirectory: () => ctx.workspaces.pickDirectory(),
  });

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'connect',
    order: 20,
    label: () => t('连接中心'),
    locale: IM_LOCALE_NAMESPACE,
    inject: () => ({
      ...rpcCalls,
      workspaceDirectoryPicker,
    }),
  }, IMSettingsTab));
}
