import { createProductionController } from './production.mjs';
import { installIMessageRpc } from './rpc.mjs';

export const name = 'dsh-connect-imessage-host';
export const inject = ['connection', 'credentials', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) return installIMessageRpc(ctx, config.controller, config.rpcAuthority);
  const production = await createProductionController(ctx, config, config.internals ?? {});
  const disposeRpc = installIMessageRpc(ctx, production.controller, config.rpcAuthority);
  ctx.effect(() => async () => {
    await production.close();
  }, 'dsh-connect: close iMessage connection');
  return disposeRpc;
}

export { createProductionController } from './production.mjs';
export {
  IMESSAGE_ENDPOINTS,
  IMESSAGE_RPC_CHANNEL,
  IMESSAGE_RPC_ENDPOINTS,
  createIMessageRpcHandler,
  installIMessageRpc,
} from './rpc.mjs';
