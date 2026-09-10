import { TOKEN_BOT_ENDPOINTS, createTokenChannelApi } from '../shared/token-api.js';

export const IMESSAGE_RPC_CHANNEL = '/imessage';
export const IMESSAGE_ENDPOINTS = Object.freeze({
  ...TOKEN_BOT_ENDPOINTS,
  bindNative: 'bot.bind-native',
  bindCredentials: 'bot.bind-native',
  permissions: 'permissions.status',
});

const api = createTokenChannelApi('iMessage', ' macOS Messages 连接');
export { api as imessageClientApi };
export const unwrapRpcResult = api.unwrapRpcResult;
export const normalizeSnapshot = api.normalizeSnapshot;
export const presentError = api.presentError;
