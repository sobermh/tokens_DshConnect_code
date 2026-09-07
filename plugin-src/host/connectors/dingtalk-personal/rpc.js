import {
  DINGTALK_PERSONAL_ENDPOINTS,
  DINGTALK_PERSONAL_RPC_CHANNEL,
} from '../../../shared/connectors/dingtalk-personal-contract.js';

function badRequest(message) {
  return { ok: false, error: { code: 'bad-request', message, details: {} } };
}

export function createDingtalkRpcHandler(service) {
  return async (endpoint, payload) => {
    if (endpoint === DINGTALK_PERSONAL_ENDPOINTS.status) {
      return { ok: true, value: await service.status() };
    }
    if (endpoint === DINGTALK_PERSONAL_ENDPOINTS.connect) {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).some((key) => key !== 'force')
        || (payload.force !== undefined && typeof payload.force !== 'boolean')) {
        return badRequest('invalid DingTalk connect request');
      }
      service.startConnect(payload.force === true);
      return { ok: true, value: await service.status() };
    }
    if (endpoint === DINGTALK_PERSONAL_ENDPOINTS.disconnect) {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).length !== 1 || payload.confirm !== true) {
        return badRequest('invalid DingTalk disconnect request');
      }
      return { ok: true, value: await service.disconnect() };
    }
    return {
      ok: false,
      error: { code: 'internal', message: `unknown endpoint ${endpoint}`, details: {} },
    };
  };
}

export function registerDingtalkRpc(ctx, service) {
  ctx.inject(['connection'], (uiCtx) => {
    uiCtx.effect(() => uiCtx.connection.rpc.handle(
      DINGTALK_PERSONAL_RPC_CHANNEL,
      createDingtalkRpcHandler(service),
      { authority: 'trusted-host' },
    ), 'dingtalk-personal: settings rpc channel');
  });
}
