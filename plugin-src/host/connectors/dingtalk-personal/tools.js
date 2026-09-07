import { defineTool } from '@deepseek-ai/dsh-tools';

import { DINGTALK_STATUS_OUTPUT, renderDingtalkStatus } from './status-output.js';

export function registerDingtalkTools(ctx, service) {
  ctx.tools.register(defineTool({
    name: 'dingtalk_connect',
    description: 'Default connection tool for an unqualified request such as “帮我连接钉钉”. Connects a '
      + 'DingTalk personal account through the official DWS device authorization flow without asking the user '
      + 'to choose an account type. '
      + 'Returns a complete one-click login.dingtalk.com link; show it to the user, then call dingtalk_status '
      + 'until connected. Reuses an existing valid login unless force=true.',
    parameters: {
      force: {
        type: 'boolean',
        description: 'Start authorization again to change or refresh the DingTalk account.',
      },
    },
    output: { schema: DINGTALK_STATUS_OUTPUT, render: (_args, value) => renderDingtalkStatus(value) },
    async execute(args) {
      service.startConnect(args.force ?? false);
      await service.waitForAuthorizationStart();
      return service.status();
    },
  }));

  ctx.tools.register(defineTool({
    name: 'dingtalk_status',
    description: 'Check DingTalk personal authorization progress. After dingtalk_connect, wait for a new phase '
      + 'and relay the one-click authorization link to the user. Read-only.',
    parameters: {
      wait_seconds: { type: 'integer', description: 'Maximum wait time in seconds (default 20, max 120).' },
    },
    output: { schema: DINGTALK_STATUS_OUTPUT, render: (_args, value) => renderDingtalkStatus(value) },
    async execute(args, exec) {
      const waitMs = Math.min(Math.max(args.wait_seconds ?? 20, 0), 120) * 1000;
      await service.waitForProgress(waitMs, exec.signal);
      return service.status(exec.signal);
    },
  }));

  ctx.tools.register(defineTool({
    name: 'dws',
    description: 'Run one official DingTalk Workspace CLI business command. Commands in installed dingtalk-* '
      + 'Skills must be passed as an argv array to this tool. Authentication, upgrade, plugin, skill, config, '
      + 'and secret-bearing flags are blocked. Set confirmed=true only after the user explicitly approves the '
      + 'specific write or destructive operation; the wrapper then supplies --yes.',
    parameters: {
      args: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'DWS argv without the executable name, for example ["todo", "list", "--format", "json"].',
      },
      confirmed: {
        type: 'boolean',
        description: 'Whether the user explicitly confirmed this exact write/destructive operation.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          exitCode: { type: 'integer', required: true },
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.stdout || value.stderr || 'DWS command completed.' }],
    },
    async execute(args, exec) {
      return service.execute(args.args, { signal: exec.signal, confirmed: args.confirmed === true });
    },
  }));
}
