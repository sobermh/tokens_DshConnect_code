import { DINGTALK_INTENT_ROUTING_PROMPT } from './intent-routing.js';

export function registerDingtalkPrompt(ctx) {
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'dsh-connect:dingtalk-workspace',
      order: 116,
      text: `${DINGTALK_INTENT_ROUTING_PROMPT} For DingTalk business operations, follow the installed dingtalk-* Skill. Execute every command `
        + 'shown by those Skills through the registered dws tool as an argv array, without a shell. Never add '
        + '--yes yourself; set confirmed=true only after the user explicitly confirms that exact write or '
        + 'destructive action. Use dingtalk_connect when personal authorization is missing.',
    });
  });
}
