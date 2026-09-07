export const DINGTALK_PERSONAL_STYLE_ID = 'tokens-dsh-connect-dingtalk-personal-settings';

const CSS = String.raw`
.ddp-page { --ddp-accent: #1677ff; --ddp-success: var(--dsw-alias-state-success-primary, #20a162); --ddp-danger: var(--dsw-alias-state-error-primary, #d54941); width: 100%; color: var(--dsw-alias-label-primary, #1f2329); }
.ddp-page *, .ddp-page *::before, .ddp-page *::after { box-sizing: border-box; }
.ddp-page button, .ddp-page a { font: inherit; letter-spacing: 0; }
.ddp-serviceHead { display: grid; grid-template-columns: 42px minmax(0, 1fr) max-content; align-items: center; gap: 12px; padding: 1px 0 16px; }
.ddp-serviceLogo { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 8px; color: #fff; background: var(--ddp-accent); }
.ddp-serviceLogo svg { width: 32px; height: 32px; }
.ddp-serviceCopy { min-width: 0; display: grid; }
.ddp-serviceCopy strong { overflow: hidden; font-size: 18px; line-height: 25px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.ddp-serviceCopy small { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.ddp-badge { min-height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); font-size: 11px; line-height: 18px; font-weight: 600; white-space: nowrap; }
.ddp-badge::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.ddp-badge[data-phase='connected'] { color: var(--ddp-success); background: color-mix(in srgb, var(--ddp-success) 10%, transparent); }
.ddp-badge[data-phase='preparing'], .ddp-badge[data-phase='authorizing'] { color: #ad6800; background: #fff7e6; }
.ddp-badge[data-phase='error'] { color: var(--ddp-danger); background: color-mix(in srgb, var(--ddp-danger) 9%, transparent); }
.ddp-notice, .ddp-warning { margin-bottom: 12px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--ddp-danger) 25%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; color: var(--ddp-danger); background: color-mix(in srgb, var(--ddp-danger) 5%, transparent); font-size: 11px; line-height: 17px; overflow-wrap: anywhere; }
.ddp-health { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); }
.ddp-healthItem { min-width: 0; display: flex; align-items: flex-start; gap: 9px; padding: 11px; border-right: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-healthItem:last-child { border-right: 0; }
.ddp-dot { width: 7px; height: 7px; flex: none; margin-top: 5px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8f959e); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-label-tertiary, #8f959e) 12%, transparent); }
.ddp-healthItem[data-active='true'] .ddp-dot { background: var(--ddp-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ddp-success) 12%, transparent); }
.ddp-healthItem > span:last-child { min-width: 0; display: grid; }
.ddp-healthItem strong { overflow: hidden; font-size: 11px; line-height: 16px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
.ddp-healthItem small { overflow: hidden; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 9px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.ddp-tabs { display: flex; gap: 22px; margin-top: 18px; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-tabs button { position: relative; padding: 0 0 10px; border: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font-size: 12px; line-height: 18px; font-weight: 600; cursor: pointer; }
.ddp-tabs button[aria-selected='true'] { color: var(--dsw-alias-label-primary, #1f2329); }
.ddp-tabs button[aria-selected='true']::after { content: ''; position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; background: var(--ddp-accent); }
.ddp-section { padding: 18px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-section:last-child { border-bottom: 0; }
.ddp-sectionHead { margin-bottom: 13px; }
.ddp-sectionHead h3 { margin: 0; font-size: 14px; line-height: 21px; font-weight: 650; }
.ddp-sectionHead p { margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.ddp-authAction { display: grid; grid-template-columns: 25px minmax(0, 1fr) max-content; align-items: center; gap: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--ddp-accent) 25%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; background: color-mix(in srgb, var(--ddp-accent) 4%, transparent); }
.ddp-authIcon { width: 25px; height: 25px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--ddp-accent); font-size: 11px; font-weight: 700; }
.ddp-authAction > span:nth-child(2) { min-width: 0; display: grid; }
.ddp-authAction strong { font-size: 11px; line-height: 17px; font-weight: 620; }
.ddp-authAction small { color: var(--dsw-alias-label-secondary, #646a73); font-size: 9px; line-height: 14px; }
.ddp-authAction a { display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border: 1px solid var(--ddp-accent); border-radius: 7px; color: #fff; background: var(--ddp-accent); font-size: 10px; line-height: 16px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.ddp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.ddp-button { min-height: 34px; padding: 5px 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font-size: 11px; line-height: 18px; font-weight: 600; cursor: pointer; }
.ddp-button[data-kind='primary'] { border-color: var(--ddp-accent); color: #fff; background: var(--ddp-accent); }
.ddp-button[data-kind='danger'] { color: var(--ddp-danger); }
.ddp-button:disabled { opacity: .52; cursor: default; }
.ddp-detailList { display: grid; margin: 0; }
.ddp-detailList > div { min-height: 39px; display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 12px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-detailList > div:last-child { border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-detailList dt { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; }
.ddp-detailList dd { min-width: 0; margin: 0; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.ddp-capabilityGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-capability { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 8px; padding: 10px 10px 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-capability:nth-child(odd) { border-right: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.ddp-capability:nth-child(even) { padding-left: 10px; }
.ddp-capabilityCheck { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; color: var(--ddp-success); background: color-mix(in srgb, var(--ddp-success) 10%, transparent); font-size: 10px; font-weight: 700; }
.ddp-capability > span:last-child { min-width: 0; display: grid; }
.ddp-capability strong { font-size: 11px; line-height: 16px; font-weight: 620; }
.ddp-capability code { overflow: hidden; color: var(--dsw-alias-label-tertiary, #8f959e); font: 9px/14px var(--ds-font-family-code, monospace); text-overflow: ellipsis; white-space: nowrap; }
.ddp-empty { padding: 18px 0; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; }
.ddp-warning { margin-top: 12px; margin-bottom: 0; border-color: #ffd591; color: #ad6800; background: #fff7e6; }
.ddp-source { margin: 10px 0 0; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 9px; line-height: 15px; }
@container (max-width: 560px) {
  .ddp-health, .ddp-capabilityGrid { grid-template-columns: minmax(0, 1fr); }
  .ddp-healthItem { border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
  .ddp-healthItem:last-child { border-bottom: 0; }
  .ddp-authAction { grid-template-columns: 25px minmax(0, 1fr); }
  .ddp-authAction a { grid-column: 1 / -1; justify-content: center; }
  .ddp-capability:nth-child(odd) { border-right: 0; }
  .ddp-capability:nth-child(even) { padding-left: 0; }
}
`;

export function installDingtalkPersonalStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${DINGTALK_PERSONAL_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = '@tokens/dsh-connect';
  style.dataset.pluginCss = DINGTALK_PERSONAL_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
