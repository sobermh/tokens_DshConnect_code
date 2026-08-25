/**
 * Feishu one-click app creation: the OAuth 2.0 Device Authorization Grant
 * (RFC 8628) spoken by `accounts.feishu.cn/oauth/v1/app/registration`, ported
 * from the TokensAgent Go implementation (itself a port of larksuite/node-sdk
 * scene/registration). Flow: begin → QR/confirm URL + device_code → the user
 * opens the URL and confirms → poll until client_id/client_secret arrive.
 * The confirm URL pre-fills app name and the full scope grant via the gzip +
 * base64url `addons` parameter, so the created app needs no console visit.
 * @module
 */
import { gzipSync } from 'node:zlib';
const FEISHU_ACCOUNTS_HOST = 'accounts.feishu.cn';
const LARK_ACCOUNTS_HOST = 'accounts.larksuite.com';
const FEISHU_CONFIRM_HOST = 'open.feishu.cn';
const LARK_CONFIRM_HOST = 'open.larksuite.com';
const REGISTRATION_PATH = '/oauth/v1/app/registration';
const HTTP_TIMEOUT_MS = 15_000;
const DEFAULT_INTERVAL_SEC = 5;
const MAX_INTERVAL_SEC = 30;
const DEFAULT_EXPIRES_SEC = 600;
async function postForm(host, form, signal) {
    const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS);
    const response = await fetch(`https://${host}${REGISTRATION_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    });
    // Business errors (authorization_pending etc.) ride 4xx bodies; parse regardless.
    const text = await response.text();
    if (text.trim().length === 0) {
        throw new Error(`Feishu registration: empty response (HTTP ${response.status})`);
    }
    return JSON.parse(text);
}
/** JSON → gzip → URL-safe base64 without padding, matching node-sdk encodeAddons. */
function encodeAddons(tenantScopes, userScopes) {
    const payload = { scopes: { tenant: [...tenantScopes], user: [...userScopes] } };
    return gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64url');
}
/** Accept only HTTPS confirmation pages owned by the selected platform. */
function verificationUrl(raw, expectedHosts) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error('Feishu registration begin: invalid confirm URL');
    }
    if (url.protocol !== 'https:' || !expectedHosts.includes(url.hostname)) {
        throw new Error('Feishu registration begin: untrusted confirm URL');
    }
    return url;
}
/**
 * Start one one-click registration.
 * @param options - domain, preset identity, and scope grant.
 * @returns the session to poll, including the confirm URL for the user.
 */
export async function beginRegistration(options) {
    const host = options.domain === 'lark' ? LARK_ACCOUNTS_HOST : FEISHU_ACCOUNTS_HOST;
    const confirmHosts = options.domain === 'lark'
        ? [LARK_ACCOUNTS_HOST, LARK_CONFIRM_HOST]
        : [FEISHU_ACCOUNTS_HOST, FEISHU_CONFIRM_HOST];
    const res = await postForm(host, {
        action: 'begin',
        archetype: 'PersonalAgent',
        auth_method: 'client_secret',
        request_user_info: 'open_id',
    }, options.signal);
    if (res.error !== undefined && res.error !== '') {
        throw new Error(`Feishu registration begin: ${res.error} - ${res.error_description ?? ''}`);
    }
    if (res.device_code === undefined || res.verification_uri_complete === undefined) {
        throw new Error('Feishu registration begin: response missing device_code or confirm URL');
    }
    // The URL is displayed directly to the user, so treat the response as
    // untrusted input even though it came from the accounts API.
    const url = verificationUrl(res.verification_uri_complete, confirmHosts);
    url.searchParams.set('from', 'sdk');
    url.searchParams.set('tp', 'sdk');
    url.searchParams.set('source', 'dsh-feishu');
    url.searchParams.set('name', options.appName);
    url.searchParams.set('desc', options.appDesc);
    url.searchParams.set('addons', encodeAddons(options.tenantScopes, options.userScopes));
    const expiresSec = res.expires_in !== undefined && res.expires_in > 0 ? res.expires_in : DEFAULT_EXPIRES_SEC;
    return {
        deviceCode: res.device_code,
        host,
        intervalSec: res.interval !== undefined && res.interval > 0 ? res.interval : DEFAULT_INTERVAL_SEC,
        expiresAt: Date.now() + expiresSec * 1000,
        switched: false,
        qrUrl: url.toString(),
    };
}
/**
 * Poll one registration session once. Handles pending/slow_down (interval
 * bump), the feishu→lark host switch, expiry, and denial; network failures
 * report `pending` so the caller's loop retries.
 * @param session - session from {@link beginRegistration}; mutated in place.
 * @param signal - abort signal for the request.
 * @returns the poll outcome.
 */
export async function pollRegistration(session, signal) {
    if (Date.now() > session.expiresAt) {
        return { status: 'expired', message: 'QR code expired; start over' };
    }
    let res;
    try {
        res = await postForm(session.host, { action: 'poll', device_code: session.deviceCode }, signal);
    }
    catch (error) {
        if (signal?.aborted)
            throw error;
        return { status: 'pending' };
    }
    // The scanning user's brand routes lark tenants to the international host.
    if (res.user_info?.tenant_brand?.toLowerCase() === 'lark'
        && !session.switched && session.host !== LARK_ACCOUNTS_HOST) {
        session.host = LARK_ACCOUNTS_HOST;
        session.switched = true;
        return { status: 'pending' };
    }
    if (res.client_id !== undefined && res.client_id !== ''
        && res.client_secret !== undefined && res.client_secret !== '') {
        return {
            status: 'success',
            appId: res.client_id,
            appSecret: res.client_secret,
            domain: session.host === LARK_ACCOUNTS_HOST ? 'lark' : 'feishu',
            ...res.user_info?.open_id === undefined ? {} : { openId: res.user_info.open_id },
        };
    }
    switch (res.error) {
        case undefined:
        case '':
        case 'authorization_pending':
            return { status: 'pending' };
        case 'slow_down':
            session.intervalSec = Math.min(session.intervalSec + 5, MAX_INTERVAL_SEC);
            return { status: 'pending' };
        case 'access_denied':
            return { status: 'denied', message: 'authorization was cancelled by the user' };
        case 'expired_token':
            return { status: 'expired', message: 'QR code expired; start over' };
        default:
            return { status: 'error', message: `${res.error}: ${res.error_description ?? ''}` };
    }
}
