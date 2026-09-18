import { createImHostPlugin as createUpstreamImHostPlugin } from './upstream-im.mjs';
import { apply as applyFeishu } from './channels/feishu/index.mjs';
import { createFeishuApplicationService } from './feishu-application-service.mjs';

export const name = 'dsh-connect-host';
export const inject = ['connection', 'credentials', 'tools', 'typertGateway'];

function feishuPersonalConfig(config, applicationService) {
  return {
    appIdEnv: 'FEISHU_APP_ID',
    appSecretEnv: 'FEISHU_APP_SECRET',
    baseURL: 'https://open.feishu.cn',
    appName: 'Tokens 工作助手',
    appDesc: 'TokensHarness · 飞书连接',
    profile: 'dsh-feishu',
    ...(config.feishuPersonal ?? {}),
    ...(applicationService ? { applicationService } : {}),
  };
}

async function loadFeishuPersonalConnector() {
  return import('./connectors/feishu-personal/index.js');
}

async function loadDingtalkPersonalConnector() {
  return import('./connectors/dingtalk-personal/index.js');
}

export async function applyFeishuPersonalConnector(ctx, config, loadConnector = loadFeishuPersonalConnector) {
  const connector = await loadConnector();
  if (typeof ctx?.plugin !== 'function') return connector.apply(ctx, config);
  const fiber = ctx.plugin(connector, config);
  await fiber.await();
  return fiber;
}

export async function applyDingtalkPersonalConnector(ctx, config, loadConnector = loadDingtalkPersonalConnector) {
  const connector = await loadConnector();
  if (typeof ctx?.plugin !== 'function') return connector.apply(ctx, config);
  const fiber = ctx.plugin(connector, config);
  await fiber.await();
  return fiber;
}

export function createImHostPlugin(internals = {}) {
  return Object.freeze({
    name,
    inject,
    async apply(ctx, config = {}) {
      // Share one application service without delaying unrelated channels.
      let applicationServicePromise;
      const applicationService = (readyCtx) => applicationServicePromise ??= Promise.resolve().then(() => {
        if (config.applicationService) return config.applicationService;
        if (!readyCtx?.credentials) return undefined;
        return (internals.createFeishuApplicationService ?? createFeishuApplicationService)(readyCtx, config);
      });
      const core = createUpstreamImHostPlugin({
        ...internals,
        applyFeishu: async (readyCtx, channelConfig) => {
          const service = await applicationService(readyCtx);
          return (internals.applyFeishu ?? applyFeishu)(readyCtx, {
            ...channelConfig,
            ...(service ? { applicationService: service } : {}),
          });
        },
        additionalChannels: [
          ['feishuPersonal', async (readyCtx) => {
            const service = await applicationService(readyCtx);
            return (internals.applyFeishuPersonal ?? applyFeishuPersonalConnector)(
              readyCtx, feishuPersonalConfig(config, service),
            );
          }],
          ['dingtalkPersonal', (readyCtx) => (
            (internals.applyDingtalkPersonal ?? applyDingtalkPersonalConnector)(readyCtx, config.dingtalkPersonal ?? {})
          )],
        ],
      });
      return core.apply(ctx, config);
    },
  });
}

export async function apply(ctx, config = {}) {
  return createImHostPlugin().apply(ctx, config);
}
