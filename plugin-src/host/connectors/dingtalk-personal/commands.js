import { errorText } from './service.js';
import { renderDingtalkStatus } from './status-output.js';

function statusText(status) {
  return renderDingtalkStatus(status).map((block) => block.text).join('\n');
}

export function registerDingtalkCommands(ctx, service) {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'dingtalk-connect',
      description: '连接或重新授权钉钉个人账号。',
      input: { hint: '[force]' },
      async handler({ rawInput }) {
        service.startConnect(rawInput.trim().toLowerCase() === 'force');
        await service.waitForAuthorizationStart();
        const status = await service.status();
        return {
          kind: status.phase === 'error' ? 'error' : 'success',
          text: statusText(status),
        };
      },
    });
    commandCtx.commands.register({
      name: 'dingtalk-status',
      description: '查看钉钉个人授权状态。',
      async handler() {
        return { kind: 'success', text: statusText(await service.status()) };
      },
    });
    commandCtx.commands.register({
      name: 'dingtalk-skills-refresh',
      description: '刷新官方 DWS 与 dingtalk-* Skills。',
      async handler() {
        try {
          const result = await service.refreshSkills();
          return {
            kind: 'success',
            text: `已安装 ${result.count} 个钉钉 Skills（${result.version}）。`,
          };
        } catch (error) {
          return { kind: 'error', text: errorText(error) };
        }
      },
    });
  });
}
