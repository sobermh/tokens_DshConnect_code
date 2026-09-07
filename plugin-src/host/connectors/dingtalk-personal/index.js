import { registerDingtalkCommands } from './commands.js';
import { createDws } from './dws.js';
import { registerDingtalkPrompt } from './prompt.js';
import { registerDingtalkRpc } from './rpc.js';
import { createDingtalkPersonalService } from './service.js';
import { ensureDwsSkills, inspectDwsSkills } from './skills-provision.js';
import { registerDingtalkTools } from './tools.js';

export const name = 'dingtalk-personal';
export const inject = ['tools'];

export async function apply(ctx, _config = {}, internals = {}) {
  const dws = (internals.createDws ?? createDws)(internals.dwsInternals);
  const service = createDingtalkPersonalService({
    dws,
    ensureSkills: internals.ensureDwsSkills ?? ensureDwsSkills,
    inspectSkills: internals.inspectDwsSkills ?? inspectDwsSkills,
    logger: ctx.logger,
  });

  ctx.effect(() => () => service.dispose());
  registerDingtalkTools(ctx, service);
  registerDingtalkPrompt(ctx);
  registerDingtalkCommands(ctx, service);
  registerDingtalkRpc(ctx, service);
}
