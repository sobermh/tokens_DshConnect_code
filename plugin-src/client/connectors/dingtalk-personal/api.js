export const DINGTALK_PERSONAL_RPC_CHANNEL = '/tokens-dingtalk-workspace';

export const DINGTALK_PERSONAL_ENDPOINTS = Object.freeze({
  status: 'dingtalk/status',
  connect: 'dingtalk/connect',
  disconnect: 'dingtalk/disconnect',
});

function unwrap(result) {
  if (result?.ok === true) return result.value;
  throw new Error(result?.error?.message ?? '钉钉个人连接请求失败');
}

export async function fetchDingtalkPersonalStatus(rpcCall, signal) {
  return unwrap(await rpcCall(DINGTALK_PERSONAL_ENDPOINTS.status, {}, signal));
}

export async function connectDingtalkPersonal(rpcCall, { force = false } = {}, signal) {
  return unwrap(await rpcCall(DINGTALK_PERSONAL_ENDPOINTS.connect, { force }, signal));
}

export async function disconnectDingtalkPersonal(rpcCall, signal) {
  return unwrap(await rpcCall(
    DINGTALK_PERSONAL_ENDPOINTS.disconnect,
    { confirm: true },
    signal,
  ));
}
