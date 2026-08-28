export const PERSONAL_SCOPE_SOURCE = 'lark-cli auth status --json --verify';

function scopeValues(values) {
    if (!Array.isArray(values))
        return [];
    return [...new Set(values.filter((value) => typeof value === 'string' && value.trim() !== '')
        .map((value) => value.trim()))].sort((left, right) => left.localeCompare(right));
}

function normalizedApplicationEntries(applicationScopes) {
    if (Array.isArray(applicationScopes?.entries)) {
        return applicationScopes.entries.filter((entry) => entry !== null
            && typeof entry === 'object'
            && !Array.isArray(entry)
            && typeof entry.name === 'string'
            && (entry.type === 'tenant' || entry.type === 'user')
            && typeof entry.granted === 'boolean');
    }
    return [
        ...scopeValues(applicationScopes?.values).map((name) => ({ name, type: 'tenant', granted: true })),
        ...scopeValues(applicationScopes?.pendingValues).map((name) => ({ name, type: 'tenant', granted: false })),
    ];
}

function applicationGroup(entries, type) {
    const matching = entries.filter((entry) => entry.type === type);
    const granted = scopeValues(matching.filter((entry) => entry.granted).map((entry) => entry.name));
    const pending = scopeValues(matching.filter((entry) => !entry.granted).map((entry) => entry.name));
    return {
        count: granted.length,
        granted,
        pendingCount: pending.length,
        pending,
    };
}

function permissionState(available, group, scope) {
    if (!available)
        return 'unknown';
    if (group.granted.includes(scope))
        return 'granted';
    if (group.pending.includes(scope))
        return 'pending';
    return 'missing';
}

export function buildPermissionReport(status, applicationScopes = {}, requestedScope) {
    const scope = typeof requestedScope === 'string' && requestedScope.trim() !== ''
        ? requestedScope.trim()
        : null;
    const applicationAvailable = applicationScopes?.available === true;
    const applicationEntries = normalizedApplicationEntries(applicationScopes);
    const tenant = applicationGroup(applicationEntries, 'tenant');
    const user = applicationGroup(applicationEntries, 'user');
    const personalGranted = scopeValues(status?.scopes);
    const personalAvailable = status?.connected === true;
    const application = {
        available: applicationAvailable,
        source: applicationScopes?.source ?? 'GET /open-apis/application/v6/scopes',
        tenant,
        user,
    };
    const personal = {
        available: personalAvailable,
        verified: status?.verified === true,
        source: PERSONAL_SCOPE_SOURCE,
        count: personalGranted.length,
        granted: personalGranted,
    };
    return {
        checkedAt: new Date().toISOString(),
        requestedScope: scope,
        application,
        personal,
        match: scope === null ? null : {
            scope,
            applicationTenant: permissionState(applicationAvailable, tenant, scope),
            applicationUser: permissionState(applicationAvailable, user, scope),
            personal: permissionState(personalAvailable, { granted: personalGranted, pending: [] }, scope),
        },
    };
}
