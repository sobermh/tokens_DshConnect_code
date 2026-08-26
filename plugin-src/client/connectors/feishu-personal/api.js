export const FEISHU_PERSONAL_RPC_CHANNEL = '/tokens-feishu-connect';

export const FEISHU_PERSONAL_ENDPOINTS = Object.freeze({
  status: 'feishu/status',
  connect: 'feishu/connect',
  disconnect: 'feishu/disconnect',
});

function unwrap(result) {
  if (result?.ok === true) return result.value;
  throw new Error(result?.error?.message ?? '飞书个人连接请求失败');
}

export async function fetchFeishuPersonalStatus(rpcCall, signal) {
  return unwrap(await rpcCall(FEISHU_PERSONAL_ENDPOINTS.status, {}, signal));
}

export async function connectFeishuPersonal(rpcCall, input, signal) {
  return unwrap(await rpcCall(FEISHU_PERSONAL_ENDPOINTS.connect, input, signal));
}

export async function disconnectFeishuPersonal(rpcCall, signal) {
  return unwrap(await rpcCall(
    FEISHU_PERSONAL_ENDPOINTS.disconnect,
    { confirm: true },
    signal,
  ));
}
