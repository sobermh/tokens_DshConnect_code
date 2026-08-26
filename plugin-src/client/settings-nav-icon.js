export const CONNECTION_CENTER_NAV_ATTRIBUTE = 'data-dsh-connect-nav';

const CONNECTION_CENTER_LABELS = new Set(['连接中心', 'Connection center']);

function navLabel(button) {
  const spans = button?.querySelectorAll?.('span');
  if (!spans) return '';
  return [...spans].map((span) => span.textContent?.trim() ?? '').find((label) =>
    CONNECTION_CENTER_LABELS.has(label)) ?? '';
}

export function markConnectionCenterNav(root = globalThis.document) {
  if (typeof root?.querySelectorAll !== 'function') return [];
  const marked = [];
  for (const button of root.querySelectorAll('nav button')) {
    if (navLabel(button)) {
      button.setAttribute(CONNECTION_CENTER_NAV_ATTRIBUTE, 'true');
      marked.push(button);
    } else {
      button.removeAttribute(CONNECTION_CENTER_NAV_ATTRIBUTE);
    }
  }
  return marked;
}

export function installConnectionCenterNavIcon(
  root = globalThis.document,
  Observer = globalThis.MutationObserver,
) {
  if (typeof root?.querySelectorAll !== 'function') return () => {};
  const update = () => markConnectionCenterNav(root);
  update();
  if (typeof Observer !== 'function') {
    return () => {
      for (const button of root.querySelectorAll(`[${CONNECTION_CENTER_NAV_ATTRIBUTE}]`)) {
        button.removeAttribute(CONNECTION_CENTER_NAV_ATTRIBUTE);
      }
    };
  }
  const observer = new Observer(update);
  const target = root.body ?? root.documentElement;
  if (target) observer.observe(target, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    for (const button of root.querySelectorAll(`[${CONNECTION_CENTER_NAV_ATTRIBUTE}]`)) {
      button.removeAttribute(CONNECTION_CENTER_NAV_ATTRIBUTE);
    }
  };
}
