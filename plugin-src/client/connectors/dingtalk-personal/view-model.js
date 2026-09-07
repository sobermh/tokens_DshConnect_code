export function safeDingtalkPersonalHref(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'login.dingtalk.com'
      || url.pathname !== '/oauth2/device/verify.htm') return undefined;
    const code = url.searchParams.get('user_code');
    if ([...url.searchParams.keys()].length !== 1
      || code === null || !/^[A-Z0-9]{4,12}(?:-[A-Z0-9]{2,12})+$/.test(code)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function deriveDingtalkPersonalView(status) {
  if (status === undefined) {
    return { phase: 'loading', connected: false, connecting: false, actionHref: undefined };
  }
  const connected = status.authenticated === true;
  const phase = connected ? 'connected' : status.phase ?? 'idle';
  const connecting = !connected && (phase === 'preparing' || phase === 'authorizing');
  const actionHref = phase === 'authorizing'
    ? safeDingtalkPersonalHref(status.authorizeUrl)
    : undefined;
  return { phase, connected, connecting, actionHref };
}
