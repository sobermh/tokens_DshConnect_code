export const FEISHU_PERSONAL_STYLE_ID = 'tokens-dsh-connect-feishu-personal-settings';

const CSS = String.raw`
.dfp-page { --dfp-accent: var(--dsw-alias-state-business-primary, #3370ff); --dfp-success: var(--dsw-alias-state-success-primary, #20a162); --dfp-danger: var(--dsw-alias-state-error-primary, #d54941); width: 100%; color: var(--dsw-alias-label-primary, #1f2329); }
.dfp-page *, .dfp-page *::before, .dfp-page *::after { box-sizing: border-box; }
.dfp-page button, .dfp-page a { font: inherit; letter-spacing: 0; }
.dfp-serviceHead { display: grid; grid-template-columns: 42px minmax(0, 1fr) max-content; align-items: center; gap: 12px; padding: 1px 0 16px; }
.dfp-serviceLogo { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 8px; background: #fff; }
.dfp-serviceLogo svg { width: 38px; height: 38px; }
.dfp-serviceCopy { min-width: 0; display: grid; }
.dfp-serviceCopy strong { overflow: hidden; font-size: 18px; line-height: 25px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.dfp-serviceCopy small { overflow: hidden; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; text-overflow: ellipsis; white-space: nowrap; }
.dfp-badge { min-height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); font-size: 11px; line-height: 18px; font-weight: 600; white-space: nowrap; }
.dfp-badge::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.dfp-badge[data-phase='connected'] { color: var(--dfp-success); background: color-mix(in srgb, var(--dfp-success) 10%, transparent); }
.dfp-badge[data-phase='creating'], .dfp-badge[data-phase='authorizing'] { color: #b76e00; background: color-mix(in srgb, #f5a623 12%, transparent); }
.dfp-badge[data-phase='error'] { color: var(--dfp-danger); background: color-mix(in srgb, var(--dfp-danger) 9%, transparent); }
.dfp-notice { margin-bottom: 12px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f7f8fa); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.dfp-notice[data-tone='error'] { border-color: color-mix(in srgb, var(--dfp-danger) 25%, var(--dsw-alias-border-l2, #dfe1e5)); color: var(--dfp-danger); background: color-mix(in srgb, var(--dfp-danger) 5%, transparent); }
.dfp-health { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dfp-healthItem { min-width: 0; display: flex; align-items: flex-start; gap: 9px; padding: 11px; border-right: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dfp-healthItem:last-child { border-right: 0; }
.dfp-healthDot { width: 7px; height: 7px; flex: none; margin-top: 5px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8f959e); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-label-tertiary, #8f959e) 12%, transparent); }
.dfp-healthItem[data-on='true'] .dfp-healthDot { background: var(--dfp-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dfp-success) 12%, transparent); }
.dfp-healthItem > span:last-child { min-width: 0; display: grid; }
.dfp-healthItem strong { overflow: hidden; font-size: 11px; line-height: 16px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
.dfp-healthItem small { overflow: hidden; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 9px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.dfp-tabs { display: flex; gap: 22px; margin-top: 18px; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dfp-tabs button { position: relative; padding: 0 0 10px; border: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font-size: 12px; line-height: 18px; font-weight: 600; cursor: pointer; }
.dfp-tabs button[aria-selected='true'] { color: var(--dsw-alias-label-primary, #1f2329); }
.dfp-tabs button[aria-selected='true']::after { content: ''; position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; border-radius: 2px 2px 0 0; background: var(--dfp-accent); }
.dfp-tabPanel { min-width: 0; }
.dfp-section { padding: 18px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dfp-section:last-child { border-bottom: 0; }
.dfp-sectionHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 13px; }
.dfp-sectionHead h3 { margin: 0; font-size: 14px; line-height: 21px; font-weight: 650; }
.dfp-sectionHead p { margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.dfp-domainRow { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.dfp-domainRow > span { color: var(--dfp-success); font-size: 10px; line-height: 16px; }
.dfp-segmented { display: flex; padding: 3px; border-radius: 8px; background: var(--dsw-alias-bg-module-platform, #f2f3f5); }
.dfp-segmented button { min-width: 68px; height: 29px; padding: 0 10px; border: 0; border-radius: 6px; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font-size: 11px; cursor: pointer; }
.dfp-segmented button[aria-pressed='true'] { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 1px 3px rgb(31 35 41 / 10%); font-weight: 620; }
.dfp-flowAction { display: grid; grid-template-columns: 25px minmax(0, 1fr) max-content; align-items: center; gap: 10px; margin-top: 14px; padding: 11px; border: 1px solid color-mix(in srgb, var(--dfp-accent) 24%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; background: color-mix(in srgb, var(--dfp-accent) 4%, transparent); }
.dfp-flowStep { width: 25px; height: 25px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--dfp-accent); font-size: 11px; font-weight: 700; }
.dfp-flowAction > span:nth-child(2) { min-width: 0; display: grid; }
.dfp-flowAction strong { font-size: 11px; line-height: 17px; font-weight: 620; }
.dfp-flowAction small { color: var(--dsw-alias-label-secondary, #646a73); font-size: 9px; line-height: 14px; }
.dfp-flowAction a { display: inline-flex; align-items: center; gap: 5px; padding: 6px 8px; border: 1px solid var(--dfp-accent); border-radius: 7px; color: #fff; background: var(--dfp-accent); font-size: 10px; line-height: 16px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.dfp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.dfp-button { min-height: 34px; padding: 5px 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font-size: 11px; line-height: 18px; font-weight: 600; cursor: pointer; }
.dfp-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dfp-button[data-kind='primary'] { border-color: var(--dfp-accent); color: #fff; background: var(--dfp-accent); }
.dfp-button:disabled { opacity: .52; cursor: default; }
.dfp-detailList { display: grid; margin: 0; }
.dfp-detailList > div { min-height: 39px; display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 12px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dfp-detailList > div:last-child { border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dfp-detailList dt { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; }
.dfp-detailList dd { min-width: 0; margin: 0; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.dfp-detailList code, .dfp-capability code { color: var(--dsw-alias-label-tertiary, #8f959e); font-family: var(--ds-font-family-code, monospace); font-size: 9px; }
.dfp-capabilityList { display: grid; }
.dfp-capability { min-height: 48px; display: grid; grid-template-columns: 24px minmax(0, 1fr) max-content; align-items: center; gap: 9px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dfp-capability:last-child { border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dfp-capabilityMark { width: 21px; height: 21px; display: grid; place-items: center; border-radius: 50%; color: var(--dsw-alias-label-tertiary, #8f959e); background: var(--dsw-alias-bg-module-platform, #f2f3f5); font-size: 11px; font-weight: 700; }
.dfp-capabilityMark[data-on='true'] { color: var(--dfp-success); background: color-mix(in srgb, var(--dfp-success) 10%, transparent); }
.dfp-capability > span:nth-child(2) { min-width: 0; display: grid; }
.dfp-capability strong { font-size: 11px; line-height: 17px; font-weight: 620; }
.dfp-capability > small { color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 9px; white-space: nowrap; }
.dfp-permissionSummary { display: flex; gap: 7px; flex-wrap: wrap; }
.dfp-permissionSummary span { min-height: 27px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 999px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 10px; line-height: 17px; }
.dfp-permissionSummary span::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8f959e); }
.dfp-permissionSummary span[data-on='true'] { color: var(--dfp-success); border-color: color-mix(in srgb, var(--dfp-success) 25%, var(--dsw-alias-border-l2, #dfe1e5)); }
.dfp-permissionSummary span[data-on='true']::before { background: var(--dfp-success); }
@container (max-width: 560px) {
  .dfp-health { grid-template-columns: minmax(0, 1fr); }
  .dfp-healthItem { border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
  .dfp-healthItem:last-child { border-bottom: 0; }
  .dfp-flowAction { grid-template-columns: 25px minmax(0, 1fr); }
  .dfp-flowAction a { grid-column: 1 / -1; justify-content: center; }
}
`;

export function installFeishuPersonalStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${FEISHU_PERSONAL_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = '@tokens/dsh-connect';
  style.dataset.pluginCss = FEISHU_PERSONAL_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
