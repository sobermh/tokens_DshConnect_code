export const APPLICATION_SCOPE_SOURCE = 'lark-cli api GET /open-apis/application/v6/scopes --as bot';

function cleanScopeName(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function cleanScopeType(value) {
    return value === 'tenant' || value === 'user' ? value : undefined;
}

function scopeGroup(entries, type) {
    const matching = entries.filter((entry) => entry.type === type);
    return {
        granted: matching.filter((entry) => entry.granted).map((entry) => entry.name),
        pending: matching.filter((entry) => !entry.granted).map((entry) => entry.name),
    };
}

export function applicationScopesFromData(data) {
    if (!Array.isArray(data?.scopes))
        throw new Error('Feishu application scope status returned no scope list');
    const rawScopes = data.scopes;
    const byIdentity = new Map();
    for (const rawScope of rawScopes) {
        if (rawScope === null || typeof rawScope !== 'object' || Array.isArray(rawScope))
            continue;
        const name = cleanScopeName(rawScope.scope_name);
        const type = cleanScopeType(rawScope.scope_type);
        if (name === undefined || type === undefined || typeof rawScope.grant_status !== 'number')
            continue;
        const key = `${type}:${name}`;
        const previous = byIdentity.get(key);
        const granted = previous?.granted === true || rawScope.grant_status === 1;
        byIdentity.set(key, {
            name,
            type,
            grantStatus: granted ? 1 : rawScope.grant_status,
            granted,
        });
    }
    const entries = [...byIdentity.values()].sort((left, right) => left.name.localeCompare(right.name)
        || left.type.localeCompare(right.type));
    const tenant = scopeGroup(entries, 'tenant');
    const user = scopeGroup(entries, 'user');
    return {
        available: true,
        source: APPLICATION_SCOPE_SOURCE,
        entries,
        tenant,
        user,
        values: tenant.granted,
        pendingValues: tenant.pending,
    };
}

export async function inspectApplicationScopes(lark, signal) {
    if (!lark || typeof lark.api !== 'function')
        throw new TypeError('lark-cli API access is required to inspect application permissions');
    const data = await lark.api('GET', '/open-apis/application/v6/scopes', { as: 'bot' }, signal);
    return applicationScopesFromData(data);
}

export function unavailableApplicationScopes() {
    return {
        available: false,
        source: APPLICATION_SCOPE_SOURCE,
        entries: [],
        tenant: { granted: [], pending: [] },
        user: { granted: [], pending: [] },
        values: [],
        pendingValues: [],
    };
}
