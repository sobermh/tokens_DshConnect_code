import { buildPermissionReport, PERSONAL_SCOPE_SOURCE } from './permissions.js';

const SKILLS_SOURCE = '~/.dsh/skills/.lark-skills.json';

const DOMAIN_LABELS = Object.freeze({
    approval: '审批',
    base: '多维表格',
    calendar: '日历',
    contact: '通讯录',
    docs: '文档',
    docx: '新版文档',
    drive: '云盘',
    im: '消息',
    mail: '邮箱',
    minutes: '妙记',
    okr: 'OKR',
    sheets: '电子表格',
    slides: '演示文稿',
    task: '任务',
    vc: '会议',
    wiki: '知识库',
});

function scopeDomains(scopes) {
    const counts = new Map();
    for (const scope of scopes) {
        const prefix = scope.split(':', 1)[0];
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    return [...counts]
        .map(([id, count]) => ({ id, name: DOMAIN_LABELS[id] ?? id, count }))
        .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
}

export function buildCapabilityStatus(status, skills = {}, applicationScopes = {}) {
    const permissions = buildPermissionReport(status, applicationScopes);
    const scopes = permissions.personal.granted;
    const tenant = permissions.application.tenant;
    const user = permissions.application.user;
    return {
        checkedAt: permissions.checkedAt,
        authorization: {
            source: PERSONAL_SCOPE_SOURCE,
            appIdentity: {
                available: status?.bot?.available === true,
                verified: status?.bot?.verified === true,
                status: status?.bot?.status ?? null,
            },
            personalIdentity: {
                available: status?.connected === true,
                verified: status?.verified === true,
                tokenStatus: status?.tokenStatus ?? null,
                grantedAt: status?.grantedAt ?? null,
                expiresAt: status?.expiresAt ?? null,
            },
            scopes: {
                count: scopes.length,
                values: scopes,
                domains: scopeDomains(scopes),
            },
            applicationScopes: {
                available: permissions.application.available,
                source: permissions.application.source,
                count: tenant.count,
                values: tenant.granted,
                domains: scopeDomains(tenant.granted),
                pendingCount: tenant.pendingCount,
                pendingValues: tenant.pending,
                tenant: {
                    ...tenant,
                    domains: scopeDomains(tenant.granted),
                },
                user: {
                    ...user,
                    domains: scopeDomains(user.granted),
                },
            },
            skills: {
                available: skills.available === true,
                count: skills.count ?? 0,
                version: skills.version ?? null,
                names: Array.isArray(skills.names) ? skills.names : [],
                materializedAt: skills.materializedAt ?? null,
                source: SKILLS_SOURCE,
            },
        },
    };
}
