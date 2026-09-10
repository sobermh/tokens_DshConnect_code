import { apply as applyDingtalk } from './channels/dingtalk/index.mjs';
import { apply as applyDiscord } from './channels/discord/index.mjs';
import { apply as applyFeishu } from './channels/feishu/index.mjs';
import { apply as applyQq } from './channels/qq/index.mjs';
import { apply as applySlack } from './channels/slack/index.mjs';
import { apply as applyTelegram } from './channels/telegram/index.mjs';
import { apply as applyWecom } from './channels/wecom/index.mjs';
import { apply as applyWeixin } from './channels/weixin/index.mjs';
import { apply as applyWhatsapp } from './channels/whatsapp/index.mjs';
import { apply as applyIMessage } from './channels/imessage/index.mjs';
import { installOutboundArtifactTool } from '../../src/channels/shared/semantic/artifact.mjs';
import { setImHostLanguage } from '../../src/channels/shared/i18n.mjs';
import { createFeishuApplicationService } from './feishu-application-service.mjs';

export const name = 'dsh-connect-host';
export const inject = [
  'connection',
  'credentials',
  'tools',
  'typertGateway',
];

function channelConfig(config, name, applicationService) {
  const channel = config[name] ?? {};
  const resolved = config.rpcAuthority === undefined
    ? channel
    : { ...channel, rpcAuthority: config.rpcAuthority };
  return name === 'feishu' && applicationService
    ? { ...resolved, applicationService }
    : resolved;
}

function feishuPersonalConfig(config, applicationService) {
  const resolved = {
    appIdEnv: 'FEISHU_APP_ID',
    appSecretEnv: 'FEISHU_APP_SECRET',
    baseURL: 'https://open.feishu.cn',
    appName: 'Tokens 工作助手',
    appDesc: 'TokensHarness · 飞书连接',
    profile: 'dsh-feishu',
    ...(config.feishuPersonal ?? {}),
  };
  return applicationService ? { ...resolved, applicationService } : resolved;
}

async function loadFeishuPersonalConnector() {
  return import('./connectors/feishu-personal/index.js');
}

async function loadDingtalkPersonalConnector() {
  return import('./connectors/dingtalk-personal/index.js');
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

export async function applyDingtalkPersonalConnector(
  ctx,
  config,
  loadConnector = loadDingtalkPersonalConnector,
) {
  const connector = await loadConnector();
  if (typeof ctx?.plugin !== 'function') return connector.apply(ctx, config);
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
  const startWhatsapp = internals.applyWhatsapp ?? applyWhatsapp;
  const startIMessage = internals.applyIMessage ?? applyIMessage;
  const startFeishuPersonal = internals.applyFeishuPersonal ?? applyFeishuPersonalConnector;
  const startDingtalkPersonal = internals.applyDingtalkPersonal ?? applyDingtalkPersonalConnector;
  const createApplicationService = internals.createFeishuApplicationService
    ?? createFeishuApplicationService;
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
    ['imessage', startIMessage],
    ['feishuPersonal', startFeishuPersonal],
    ['dingtalkPersonal', startDingtalkPersonal],
  ];
  return Object.freeze({
    name,
    inject,
    async apply(ctx, config = {}) {
      const activate = async (readyCtx) => {
        await activateChannels(readyCtx, config);
      };
      if (typeof ctx?.inject === 'function') {
        const modern = typeof ctx?.typertGateway?.stream === 'function';
        await ctx.inject(
          modern ? ['sessionController', 'workspaceController'] : ['apiProxy'],
          activate,
        );
        return;
      }
      await activate(ctx);
    },
  });

  async function activateChannels(ctx, config) {
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
    let applicationService = config.applicationService;
    let applicationServiceError;
    if (!applicationService && ctx?.credentials) {
      try {
        applicationService = await createApplicationService(ctx, config);
      } catch (error) {
        applicationServiceError = error;
      }
    }
    const failures = [];
    for (const [channel, start] of channels) {
      try {
        if (applicationServiceError && (channel === 'feishu' || channel === 'feishuPersonal')) {
          throw applicationServiceError;
        }
        await start(ctx, channel === 'feishuPersonal'
          ? feishuPersonalConfig(config, applicationService)
          : channel === 'dingtalkPersonal'
            ? (config.dingtalkPersonal ?? {})
            : channelConfig(config, channel, applicationService));
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
  }
}

export async function apply(ctx, config = {}) {
  return createImHostPlugin().apply(ctx, config);
}
