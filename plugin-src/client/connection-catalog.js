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
import { FEISHU_RPC_CHANNEL } from './channels/feishu/api.js';
import { FeishuSettingsTab } from './channels/feishu/index.js';
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
import { WEIXIN_RPC_CHANNEL } from './channels/weixin/api.js';
import { WeixinSettingsTab } from './channels/weixin/index.js';
import { installWeixinStyles } from './channels/weixin/styles.js';
import { WHATSAPP_RPC_CHANNEL } from './channels/whatsapp/api.js';
import { WhatsappSettingsTab } from './channels/whatsapp/index.js';
import { installWhatsappStyles } from './channels/whatsapp/styles.js';
import { DINGTALK_PERSONAL_RPC_CHANNEL } from './connectors/dingtalk-personal/api.js';
import {
  DingtalkPersonalSettings,
  preloadDingtalkPersonalStatus,
} from './connectors/dingtalk-personal/index.js';
import { installDingtalkPersonalStyles } from './connectors/dingtalk-personal/styles.js';
import { FEISHU_PERSONAL_RPC_CHANNEL } from './connectors/feishu-personal/api.js';
import {
  FeishuPersonalSettings,
  preloadFeishuPersonalStatus,
} from './connectors/feishu-personal/index.js';
import { installFeishuPersonalStyles } from './connectors/feishu-personal/styles.js';

function connection(definition) {
  return Object.freeze(definition);
}

export const CONNECTION_DEFINITIONS = Object.freeze([
  connection({
    id: 'weixin',
    label: '微信',
    groupId: 'im-bots',
    rpcKey: 'weixinRpcCall',
    rpcChannel: WEIXIN_RPC_CHANNEL,
    Component: WeixinSettingsTab,
    LogoGlyph: WeixinLogoGlyph,
    logoClass: 'dim-logoWeixin',
    installStyles: installWeixinStyles,
  }),
  connection({
    id: 'feishu-bot',
    label: '飞书机器人',
    groupId: 'im-bots',
    rpcKey: 'feishuRpcCall',
    rpcChannel: FEISHU_RPC_CHANNEL,
    Component: FeishuSettingsTab,
    LogoGlyph: FeishuLogoGlyph,
    logoClass: 'dim-logoFeishu',
    installStyles: installFeishuStyles,
  }),
  connection({
    id: 'dingtalk',
    label: '钉钉',
    groupId: 'im-bots',
    rpcKey: 'dingtalkRpcCall',
    rpcChannel: DINGTALK_RPC_CHANNEL,
    Component: DingtalkSettingsTab,
    LogoGlyph: DingtalkLogoGlyph,
    logoClass: 'dim-logoDingtalk',
  }),
  connection({
    id: 'wecom',
    label: '企业微信',
    groupId: 'im-bots',
    rpcKey: 'wecomRpcCall',
    rpcChannel: WECOM_RPC_CHANNEL,
    Component: WecomSettingsTab,
    LogoGlyph: WecomLogoGlyph,
    logoClass: 'dim-logoWecom',
    installStyles: installWecomStyles,
  }),
  connection({
    id: 'qq',
    label: 'QQ',
    groupId: 'im-bots',
    rpcKey: 'qqRpcCall',
    rpcChannel: QQ_RPC_CHANNEL,
    Component: QqSettingsTab,
    LogoGlyph: QqLogoGlyph,
    logoClass: 'dim-logoQq',
    installStyles: installQqStyles,
  }),
  connection({
    id: 'slack',
    label: 'Slack',
    groupId: 'im-bots',
    rpcKey: 'slackRpcCall',
    rpcChannel: SLACK_RPC_CHANNEL,
    Component: SlackSettingsTab,
    LogoGlyph: SlackLogoGlyph,
    logoClass: 'dim-logoSlack',
    installStyles: installSlackStyles,
  }),
  connection({
    id: 'telegram',
    label: 'Telegram',
    groupId: 'im-bots',
    rpcKey: 'telegramRpcCall',
    rpcChannel: TELEGRAM_RPC_CHANNEL,
    Component: TelegramSettingsTab,
    LogoGlyph: TelegramLogoGlyph,
    logoClass: 'dim-logoTelegram',
    installStyles: installTelegramStyles,
  }),
  connection({
    id: 'discord',
    label: 'Discord',
    groupId: 'im-bots',
    rpcKey: 'discordRpcCall',
    rpcChannel: DISCORD_RPC_CHANNEL,
    Component: DiscordSettingsTab,
    LogoGlyph: DiscordLogoGlyph,
    logoClass: 'dim-logoDiscord',
    installStyles: installDiscordStyles,
  }),
  connection({
    id: 'whatsapp',
    label: 'WhatsApp',
    groupId: 'im-bots',
    rpcKey: 'whatsappRpcCall',
    rpcChannel: WHATSAPP_RPC_CHANNEL,
    Component: WhatsappSettingsTab,
    LogoGlyph: WhatsappLogoGlyph,
    logoClass: 'dim-logoWhatsapp',
    installStyles: installWhatsappStyles,
  }),
  connection({
    id: 'feishu-personal',
    label: '飞书个人账号',
    groupId: 'authorizations',
    rpcKey: 'feishuPersonalRpcCall',
    rpcChannel: FEISHU_PERSONAL_RPC_CHANNEL,
    Component: FeishuPersonalSettings,
    LogoGlyph: FeishuLogoGlyph,
    logoClass: 'dim-logoFeishu',
    installStyles: installFeishuPersonalStyles,
    preloadStatus: preloadFeishuPersonalStatus,
  }),
  connection({
    id: 'dingtalk-personal',
    label: '钉钉个人账号',
    groupId: 'authorizations',
    rpcKey: 'dingtalkPersonalRpcCall',
    rpcChannel: DINGTALK_PERSONAL_RPC_CHANNEL,
    Component: DingtalkPersonalSettings,
    LogoGlyph: DingtalkLogoGlyph,
    logoClass: 'dim-logoDingtalk',
    installStyles: installDingtalkPersonalStyles,
    preloadStatus: preloadDingtalkPersonalStatus,
  }),
]);

const CONNECTIONS_BY_ID = new Map(CONNECTION_DEFINITIONS.map((item) => [item.id, item]));

export const CHANNEL_GROUPS = Object.freeze([
  Object.freeze({
    id: 'im-bots',
    label: 'IM机器人',
    channels: Object.freeze(CONNECTION_DEFINITIONS
      .filter((item) => item.groupId === 'im-bots')
      .map(({ id, label }) => Object.freeze({ id, label }))),
  }),
  Object.freeze({
    id: 'authorizations',
    label: '应用授权',
    channels: Object.freeze(CONNECTION_DEFINITIONS
      .filter((item) => item.groupId === 'authorizations')
      .map(({ id, label }) => Object.freeze({ id, label }))),
  }),
]);

export function connectionDefinition(id) {
  return CONNECTIONS_BY_ID.get(id) ?? CONNECTION_DEFINITIONS[0];
}

export function connectionRpcCallsFromProps(props) {
  return Object.fromEntries(CONNECTION_DEFINITIONS.map(({ rpcKey }) => [rpcKey, props[rpcKey]]));
}

export function createConnectionRpcCalls(connectionApi) {
  return Object.fromEntries(CONNECTION_DEFINITIONS.map(({ rpcKey, rpcChannel }) => [
    rpcKey,
    (endpoint, payload, signal) => connectionApi.rpc.call(rpcChannel, endpoint, payload, signal),
  ]));
}

export function installConnectionStyles() {
  const disposers = CONNECTION_DEFINITIONS
    .map((item) => item.installStyles?.())
    .filter((dispose) => typeof dispose === 'function');
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}

export function preloadConnectionStatuses(rpcCalls) {
  for (const item of CONNECTION_DEFINITIONS) {
    if (item.preloadStatus !== undefined) {
      void item.preloadStatus(rpcCalls[item.rpcKey]).catch(() => {});
    }
  }
}
