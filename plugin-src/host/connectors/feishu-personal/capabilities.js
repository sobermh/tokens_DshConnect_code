const STATUS_SOURCE = 'lark-cli auth status --json --verify';
const SKILLS_SOURCE = '~/.dsh/skills/.lark-skills.json';

const TOOL_CAPABILITIES = Object.freeze([
    {
        id: 'create-doc',
        name: '创建飞书文档',
        provider: 'feishu_create_doc',
        requiredAny: ['docx:document:create'],
    },
    {
        id: 'send-message',
        name: '发送飞书消息',
        provider: 'feishu_send_message',
        requiredAny: ['im:message.send_as_user', 'im:message'],
    },
    {
        id: 'create-bitable',
        name: '创建多维表格',
        provider: 'feishu_create_bitable',
        requiredAny: ['base:app:create'],
    },
]);

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

function toolCapability(definition, status, scopeSet) {
    if (status?.connected !== true) {
        return {
            ...definition,
            state: 'disconnected',
            detail: '需要有效的个人授权',
            evidence: [],
            source: STATUS_SOURCE,
        };
    }
    const evidence = definition.requiredAny.filter((scope) => scopeSet.has(scope));
    return {
        ...definition,
        state: evidence.length > 0 ? 'available' : 'missing_scope',
        detail: evidence.length > 0
            ? `已授权 ${evidence.join(' / ')}`
            : `缺少 ${definition.requiredAny.join(' 或 ')}`,
        evidence,
        source: STATUS_SOURCE,
    };
}

export function buildCapabilityStatus(status, skills = {}) {
    const scopes = Array.isArray(status?.scopes) ? status.scopes : [];
    const scopeSet = new Set(scopes);
    const capabilities = TOOL_CAPABILITIES.map((definition) => toolCapability(definition, status, scopeSet));
    capabilities.push({
        id: 'official-skills',
        name: '官方 Lark Skills',
        provider: 'lark-*',
        state: skills.available === true
            ? status?.connected === true ? 'available' : 'local_only'
            : 'unavailable',
        detail: skills.available === true
            ? `${skills.count ?? 0} 个已安装${skills.version ? ` · ${skills.version}` : ''}`
            : '尚未完成本机安装',
        evidence: Array.isArray(skills.names) ? skills.names : [],
        source: SKILLS_SOURCE,
    });
    return {
        checkedAt: new Date().toISOString(),
        capabilities,
        authorization: {
            source: STATUS_SOURCE,
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
