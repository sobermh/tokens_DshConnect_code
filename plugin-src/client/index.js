import * as React from 'react';

import {
  DingtalkLogoGlyph,
  DiscordLogoGlyph,
  FeishuLogoGlyph,
  QqLogoGlyph,
  SlackLogoGlyph,
  TelegramLogoGlyph,
  WecomLogoGlyph,
  WeixinLogoGlyph,
  WhatsappLogoGlyph,
} from './channel-logos.js';
import { DINGTALK_RPC_CHANNEL } from './channels/dingtalk/api.js';
import { DingtalkSettingsTab } from './channels/dingtalk/index.js';
import { DISCORD_RPC_CHANNEL } from './channels/discord/api.js';
import { DiscordSettingsTab } from './channels/discord/index.js';
import { installDiscordStyles } from './channels/discord/styles.js';
import { FeishuSettingsTab } from './channels/feishu/index.js';
import { FEISHU_RPC_CHANNEL } from './channels/feishu/api.js';
import { installFeishuStyles } from './channels/feishu/styles.js';
import { QQ_RPC_CHANNEL } from './channels/qq/api.js';
import { QqSettingsTab } from './channels/qq/index.js';
import { installQqStyles } from './channels/qq/styles.js';
import { SLACK_RPC_CHANNEL } from './channels/slack/api.js';
import { SlackSettingsTab } from './channels/slack/index.js';
import { installSlackStyles } from './channels/slack/styles.js';
import { TELEGRAM_RPC_CHANNEL } from './channels/telegram/api.js';
import { TelegramSettingsTab } from './channels/telegram/index.js';
import { installTelegramStyles } from './channels/telegram/styles.js';
import { WECOM_RPC_CHANNEL } from './channels/wecom/api.js';
import { WecomSettingsTab } from './channels/wecom/index.js';
import { installWecomStyles } from './channels/wecom/styles.js';
import { WeixinSettingsTab } from './channels/weixin/index.js';
import { WEIXIN_RPC_CHANNEL } from './channels/weixin/api.js';
import { installWeixinStyles } from './channels/weixin/styles.js';
import { WHATSAPP_RPC_CHANNEL } from './channels/whatsapp/api.js';
import { WhatsappSettingsTab } from './channels/whatsapp/index.js';
import { installWhatsappStyles } from './channels/whatsapp/styles.js';
import { FEISHU_PERSONAL_RPC_CHANNEL } from './connectors/feishu-personal/api.js';
import {
  FeishuPersonalSettings,
  preloadFeishuPersonalStatus,
} from './connectors/feishu-personal/index.js';
import { installFeishuPersonalStyles } from './connectors/feishu-personal/styles.js';
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

export const CHANNEL_GROUPS = Object.freeze([
  Object.freeze({
    id: 'im-bots',
    label: 'IM机器人',
    channels: Object.freeze([
      { id: 'weixin', label: '微信' },
      { id: 'feishu-bot', label: '飞书机器人' },
      { id: 'dingtalk', label: '钉钉' },
      { id: 'wecom', label: '企业微信' },
      { id: 'qq', label: 'QQ' },
      { id: 'slack', label: 'Slack' },
      { id: 'telegram', label: 'Telegram' },
      { id: 'discord', label: 'Discord' },
      { id: 'whatsapp', label: 'WhatsApp' },
    ]),
  }),
  Object.freeze({
    id: 'authorizations',
    label: '应用授权',
    channels: Object.freeze([
      { id: 'feishu-personal', label: '飞书个人账号' },
    ]),
  }),
]);

const CHANNELS = Object.freeze(CHANNEL_GROUPS.flatMap((group) => group.channels));

function WeixinLogo() {
  return h('span', { className: 'dim-logo dim-logoWeixin', 'aria-hidden': 'true' },
    h(WeixinLogoGlyph));
}

function FeishuLogo() {
  return h('span', { className: 'dim-logo dim-logoFeishu', 'aria-hidden': 'true' },
    h(FeishuLogoGlyph));
}

function DingtalkLogo() {
  return h('span', { className: 'dim-logo dim-logoDingtalk', 'aria-hidden': 'true' },
    h(DingtalkLogoGlyph));
}

function QqLogo() {
  return h('span', { className: 'dim-logo dim-logoQq', 'aria-hidden': 'true' }, h(QqLogoGlyph));
}

function WecomLogo() {
  return h('span', { className: 'dim-logo dim-logoWecom', 'aria-hidden': 'true' }, h(WecomLogoGlyph));
}

function TelegramLogo() {
  return h('span', { className: 'dim-logo dim-logoTelegram', 'aria-hidden': 'true' },
    h(TelegramLogoGlyph));
}

function SlackLogo() {
  return h('span', { className: 'dim-logo dim-logoSlack', 'aria-hidden': 'true' },
    h(SlackLogoGlyph));
}

function DiscordLogo() {
  return h('span', { className: 'dim-logo dim-logoDiscord', 'aria-hidden': 'true' },
    h(DiscordLogoGlyph));
}

function WhatsappLogo() {
  return h('span', { className: 'dim-logo dim-logoWhatsapp', 'aria-hidden': 'true' },
    h(WhatsappLogoGlyph));
}

function ChannelLogo({ channel }) {
  if (channel === 'weixin') return h(WeixinLogo);
  if (channel === 'feishu-bot' || channel === 'feishu-personal') return h(FeishuLogo);
  if (channel === 'dingtalk') return h(DingtalkLogo);
  if (channel === 'wecom') return h(WecomLogo);
  if (channel === 'qq') return h(QqLogo);
  if (channel === 'slack') return h(SlackLogo);
  if (channel === 'telegram') return h(TelegramLogo);
  if (channel === 'discord') return h(DiscordLogo);
  if (channel === 'whatsapp') return h(WhatsappLogo);
  return h(FeishuLogo);
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

export function IMSettingsTab({
  dingtalkRpcCall,
  discordRpcCall,
  feishuRpcCall,
  qqRpcCall,
  slackRpcCall,
  telegramRpcCall,
  wecomRpcCall,
  weixinRpcCall,
  whatsappRpcCall,
  feishuPersonalRpcCall,
  workspaceDirectoryPicker,
  browserLocation = globalThis.location,
  navigateToRecoveryUrl = replacePageLocation,
}) {
  const [selected, setSelected] = React.useState('weixin');
  const [activeGroupId, setActiveGroupId] = React.useState(CHANNEL_GROUPS[0].id);
  const [loopbackRecovery, setLoopbackRecovery] = React.useState(null);
  const githubTooltipId = React.useId();
  const groupTabsId = React.useId();
  const groupTabRefs = React.useRef([]);
  const active = CHANNELS.find((channel) => channel.id === selected) ?? CHANNELS[0];
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
  const rpcCalls = React.useMemo(() => createLoopbackAwareRpcCalls({
    dingtalkRpcCall,
    discordRpcCall,
    feishuRpcCall,
    qqRpcCall,
    slackRpcCall,
    telegramRpcCall,
    wecomRpcCall,
    weixinRpcCall,
    whatsappRpcCall,
    feishuPersonalRpcCall,
  }, {
    location: browserLocation,
    onRecovery: reportLoopbackRecovery,
  }), [
    browserLocation,
    dingtalkRpcCall,
    discordRpcCall,
    feishuRpcCall,
    feishuPersonalRpcCall,
    qqRpcCall,
    reportLoopbackRecovery,
    slackRpcCall,
    telegramRpcCall,
    wecomRpcCall,
    weixinRpcCall,
    whatsappRpcCall,
  ]);
  React.useEffect(() => {
    void preloadFeishuPersonalStatus(rpcCalls.feishuPersonalRpcCall).catch(() => {});
  }, [rpcCalls.feishuPersonalRpcCall]);
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
      active.id === 'weixin'
        ? h(WeixinSettingsTab, { rpcCall: rpcCalls.weixinRpcCall })
        : active.id === 'feishu-bot'
          ? h(FeishuSettingsTab, { rpcCall: rpcCalls.feishuRpcCall })
          : active.id === 'dingtalk'
            ? h(DingtalkSettingsTab, { rpcCall: rpcCalls.dingtalkRpcCall })
            : active.id === 'wecom'
              ? h(WecomSettingsTab, { rpcCall: rpcCalls.wecomRpcCall })
              : active.id === 'qq'
                ? h(QqSettingsTab, { rpcCall: rpcCalls.qqRpcCall })
                : active.id === 'slack'
                  ? h(SlackSettingsTab, { rpcCall: rpcCalls.slackRpcCall })
                : active.id === 'telegram'
                  ? h(TelegramSettingsTab, { rpcCall: rpcCalls.telegramRpcCall })
                  : active.id === 'discord'
                    ? h(DiscordSettingsTab, { rpcCall: rpcCalls.discordRpcCall })
                    : active.id === 'whatsapp'
                      ? h(WhatsappSettingsTab, { rpcCall: rpcCalls.whatsappRpcCall })
                      : h(FeishuPersonalSettings, { rpcCall: rpcCalls.feishuPersonalRpcCall })),
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
    const disposers = [
      installFeishuStyles(),
      installWeixinStyles(),
      installWecomStyles(),
      installQqStyles(),
      installSlackStyles(),
      installTelegramStyles(),
      installDiscordStyles(),
      installWhatsappStyles(),
      installFeishuPersonalStyles(),
      installImStyles(),
    ];
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }, 'im-settings: install combined channel styles');

  const feishuRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(FEISHU_RPC_CHANNEL, endpoint, payload, signal);
  const weixinRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(WEIXIN_RPC_CHANNEL, endpoint, payload, signal);
  const dingtalkRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(DINGTALK_RPC_CHANNEL, endpoint, payload, signal);
  const qqRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(QQ_RPC_CHANNEL, endpoint, payload, signal);
  const wecomRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(WECOM_RPC_CHANNEL, endpoint, payload, signal);
  const telegramRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(TELEGRAM_RPC_CHANNEL, endpoint, payload, signal);
  const discordRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(DISCORD_RPC_CHANNEL, endpoint, payload, signal);
  const whatsappRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(WHATSAPP_RPC_CHANNEL, endpoint, payload, signal);
  const slackRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(SLACK_RPC_CHANNEL, endpoint, payload, signal);
  const feishuPersonalRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(FEISHU_PERSONAL_RPC_CHANNEL, endpoint, payload, signal);
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
      dingtalkRpcCall,
      discordRpcCall,
      feishuRpcCall,
      qqRpcCall,
      slackRpcCall,
      telegramRpcCall,
      wecomRpcCall,
      weixinRpcCall,
      whatsappRpcCall,
      feishuPersonalRpcCall,
      workspaceDirectoryPicker,
    }),
  }, IMSettingsTab));
}
