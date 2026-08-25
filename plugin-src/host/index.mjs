import { apply as applyDingtalk } from './channels/dingtalk/index.mjs';
import { apply as applyDiscord } from './channels/discord/index.mjs';
import { apply as applyOffice } from './channels/office/index.mjs';
import { apply as applyFeishu } from './channels/feishu/index.mjs';
import { apply as applyQq } from './channels/qq/index.mjs';
import { apply as applySlack } from './channels/slack/index.mjs';
import { apply as applyTelegram } from './channels/telegram/index.mjs';
import { apply as applyWecom } from './channels/wecom/index.mjs';
import { apply as applyWeixin } from './channels/weixin/index.mjs';
import { apply as applyWhatsapp } from './channels/whatsapp/index.mjs';
import { installOutboundArtifactTool } from '../../src/channels/shared/semantic/artifact.mjs';
import { setImHostLanguage } from '../../src/channels/shared/i18n.mjs';

export const name = 'dsh-connect-host';
export const inject = [
  'connection',
  'credentials',
  'tools',
  'webServer',
  'typertGateway',
];

function channelConfig(config, name) {
  const channel = config[name] ?? {};
  return config.rpcAuthority === undefined
    ? channel
    : { ...channel, rpcAuthority: config.rpcAuthority };
}

function feishuPersonalConfig(config) {
  return {
    appIdEnv: 'FEISHU_APP_ID',
    appSecretEnv: 'FEISHU_APP_SECRET',
    baseURL: 'https://open.feishu.cn',
    appName: 'Tokens 工作助手',
    appDesc: 'TokensHarness · 飞书连接',
    profile: 'dsh-feishu',
    ...(config.feishuPersonal ?? {}),
  };
}

async function loadFeishuPersonalConnector() {
  return import('./connectors/feishu-personal/index.js');
}

export async function applyFeishuPersonalConnector(
  ctx,
  config,
  loadConnector = loadFeishuPersonalConnector,
) {
  const connector = await loadConnector();
  if (typeof ctx?.plugin !== 'function') {
    return connector.apply(ctx, config);
  }

  const fiber = ctx.plugin(connector, config);
  await fiber.await();
  return fiber;
}

function activationErrorText(error) {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

export function createImHostPlugin(internals = {}) {
  const startFeishu = internals.applyFeishu ?? applyFeishu;
  const startWeixin = internals.applyWeixin ?? applyWeixin;
  const startDingtalk = internals.applyDingtalk ?? applyDingtalk;
  const startWecom = internals.applyWecom ?? applyWecom;
  const startQq = internals.applyQq ?? applyQq;
  const startSlack = internals.applySlack ?? applySlack;
  const startTelegram = internals.applyTelegram ?? applyTelegram;
  const startDiscord = internals.applyDiscord ?? applyDiscord;
  const startOffice = internals.applyOffice ?? applyOffice;
  const startWhatsapp = internals.applyWhatsapp ?? applyWhatsapp;
  const startFeishuPersonal = internals.applyFeishuPersonal ?? applyFeishuPersonalConnector;
  const channels = [
    ['feishu', startFeishu],
    ['weixin', startWeixin],
    ['dingtalk', startDingtalk],
    ['wecom', startWecom],
    ['qq', startQq],
    ['slack', startSlack],
    ['telegram', startTelegram],
    ['discord', startDiscord],
    ['whatsapp', startWhatsapp],
    ['office', startOffice],
    ['feishuPersonal', startFeishuPersonal],
  ];
  return Object.freeze({
    name,
    inject,
    async apply(ctx, config = {}) {
      setImHostLanguage(config.language ?? process.env.DSH_IM_LANGUAGE);
      if (typeof ctx?.inject === 'function') {
        ctx.inject(['tools', 'systemPrompt'], (artifactCtx) => {
          installOutboundArtifactTool(artifactCtx);
        });
      } else {
        installOutboundArtifactTool(ctx);
      }
      const logger = typeof ctx?.logger === 'function'
        ? ctx.logger(name)
        : (ctx?.logger ?? console);
      const failures = [];
      for (const [channel, start] of channels) {
        try {
          await start(ctx, channel === 'feishuPersonal'
            ? feishuPersonalConfig(config)
            : channelConfig(config, channel));
        } catch (error) {
          failures.push(error);
          logger.error?.(
            `[dsh-connect] failed to activate ${channel}; continuing with the remaining connectors: ${activationErrorText(error)}`,
            error,
          );
        }
      }
      if (failures.length === channels.length) {
        throw new AggregateError(failures, 'dsh-connect failed to activate every connector');
      }
    },
  });
}

export async function apply(ctx, config = {}) {
  return createImHostPlugin().apply(ctx, config);
}
