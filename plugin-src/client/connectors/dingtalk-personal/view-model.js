export function safeDingtalkPersonalHref(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'login.dingtalk.com'
      || url.port !== '' || url.username !== '' || url.password !== '') return undefined;
    const keys = [...url.searchParams.keys()];
    if (url.pathname === '/oauth2/device/verify.htm') {
      const code = url.searchParams.get('user_code');
      if (keys.length !== 1 || keys[0] !== 'user_code'
        || code === null || !/^[A-Z0-9]{4,12}(?:-[A-Z0-9]{2,12})+$/.test(code)) return undefined;
      return url.href;
    }
    if (url.pathname !== '/oauth2/auth') return undefined;
    const allowedKeys = new Set([
      'client_id', 'redirect_uri', 'response_type', 'scope', 'prompt', 'corpId',
    ]);
    if (keys.length < 5 || keys.length > 6 || new Set(keys).size !== keys.length
      || keys.some((key) => !allowedKeys.has(key))) return undefined;
    const clientId = url.searchParams.get('client_id');
    const redirectValue = url.searchParams.get('redirect_uri');
    const corpId = url.searchParams.get('corpId');
    if (clientId === null || clientId.trim() === '' || clientId.length > 256
      || redirectValue === null
      || (corpId !== null && (corpId.trim() === '' || corpId.length > 256))
      || url.searchParams.get('response_type') !== 'code'
      || url.searchParams.get('scope') !== 'openid corpid'
      || url.searchParams.get('prompt') !== 'consent') return undefined;
    const redirect = new URL(redirectValue);
    const port = Number(redirect.port);
    if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1'
      || !Number.isInteger(port) || port < 1 || port > 65_535
      || redirect.pathname !== '/callback' || redirect.search !== '' || redirect.hash !== ''
      || redirect.username !== '' || redirect.password !== '') return undefined;
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
