export const DINGTALK_STATUS_OUTPUT = Object.freeze({
  type: 'object',
  properties: {
    phase: {
      type: 'string',
      required: true,
      enum: ['idle', 'preparing', 'authorizing', 'connected', 'error'],
    },
    authorizeUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    message: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    installed: { type: 'boolean', required: true },
    version: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    authenticated: { type: 'boolean', required: true },
    tokenValid: { type: 'boolean', required: true },
    refreshTokenValid: { type: 'boolean', required: true },
    userName: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    corpName: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    expiresAt: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    refreshExpiresAt: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    skills: {
      type: 'object',
      required: true,
      properties: {
        available: { type: 'boolean', required: true },
        version: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
        count: { type: 'integer', required: true },
        names: { type: 'array', items: { type: 'string' }, required: true },
        collisions: { type: 'array', items: { type: 'string' }, required: true },
        source: { type: 'string', required: true },
      },
      additionalProperties: false,
    },
    capabilities: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', required: true },
          label: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
});

export function renderDingtalkStatus(value) {
  const lines = [`DingTalk personal connection: ${value.phase}`];
  if (value.authorizeUrl !== null && value.phase === 'authorizing') {
    lines.push(`Ask the user to open this one-click DingTalk authorization link: ${value.authorizeUrl}`);
  }
  if (value.message !== null) lines.push(value.message);
  lines.push(`DWS installed: ${value.installed}, authorized: ${value.authenticated}`);
  if (value.userName !== null || value.corpName !== null) {
    lines.push(`Account: ${value.userName ?? 'unknown'} · Organization: ${value.corpName ?? 'unknown'}`);
  }
  return [{ type: 'text', text: lines.join('\n') }];
}
