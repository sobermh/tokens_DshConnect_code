import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  FeishuApplicationRegistry,
  FeishuApplicationService,
} from '../../src/channels/feishu/application-registry.mjs';

export function feishuApplicationRegistryPath(config = {}) {
  const dshHome = resolve(
    config.dshHome
      ?? process.env.DSH_HOME
      ?? join(homedir(), '.dsh'),
  );
  return resolve(
    config.feishuApplicationsPath
      ?? join(dshHome, 'integrations', 'dsh-connect', 'feishu-applications.json'),
  );
}

export async function createFeishuApplicationService(ctx, config = {}, internals = {}) {
  if (!ctx?.credentials) throw new TypeError('dsh-connect requires ctx.credentials');
  const Registry = internals.Registry ?? FeishuApplicationRegistry;
  const Service = internals.Service ?? FeishuApplicationService;
  const registry = await new Registry(feishuApplicationRegistryPath(config)).load();
  return new Service({ registry, credentials: ctx.credentials });
}
