/**
 * Feishu (Lark) connectivity plugin with true one-click onboarding. The whole
 * connection is model- or human-driven and needs no developer-console visit:
 * `feishu_connect` starts the TokensAgent-style one-click app creation (the
 * user opens ONE link and confirms; the Feishu app is created with the full
 * scope grant pre-filled), then the plugin provisions the official Larksuite
 * CLI (latest release, checksum-verified, auto-updating) and drives its
 * built-in device-code login — the user opens a SECOND link, authorizes, and
 * lark-cli stores the personal user token in the OS keychain. The flow is
 * idempotent — an existing session is reused with no link, and a returning user
 * who only needs to re-authorize opens just that one link. No redirect URL, no
 * whitelist, no admin approval. On connect the plugin also materializes the
 * official lark-* skills (version-matched to the binary) so custom sibling
 * skills that depend on `lark-shared` just work — install-and-go, self-healing.
 * Domain tools (`feishu_create_doc`, `feishu_send_message`,
 * `feishu_create_bitable`) then act as that personal identity through the
 * generic `lark-cli api` passthrough. `/feishu-connect` and `/feishu-status`
 * expose the same flow to humans.
 * @module @tokens/dsh-feishu-connect
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { beginRegistration, pollRegistration } from "./register.js";
import { TENANT_SCOPES, USER_SCOPES } from "./scopes.js";
import { createLarkcli } from "./larkcli.js";
import { clearIdentity, readIdentity, writeIdentity } from "./identity.js";
import { ensureSkills, inspectSkills } from "./skills-provision.js";
import { buildCapabilityStatus } from "./capabilities.js";
import { selectPersonalApplication } from "./application-selection.js";
import {
    inferAuthorizedApplication,
    shouldReconcileAuthorizedFlow,
    shouldSuppressAuthorizedReconcile,
} from "./authorization-state.js";
export const name = 'feishu';
export const inject = ['tools', 'credentials'];
export async function apply(ctx, config, internals = {}) {
    const beginRegistrationImpl = internals.beginRegistration ?? beginRegistration;
    const pollRegistrationImpl = internals.pollRegistration ?? pollRegistration;
    const ensureSkillsImpl = internals.ensureSkills ?? ensureSkills;
    const inspectSkillsImpl = internals.inspectSkills ?? inspectSkills;
    const readIdentityImpl = internals.readIdentity ?? readIdentity;
    const writeIdentityImpl = internals.writeIdentity ?? writeIdentity;
    const clearIdentityImpl = internals.clearIdentity ?? clearIdentity;
    const appIdRef = credentialRef(config.appIdEnv);
    const appSecretRef = credentialRef(config.appSecretEnv);
    const applicationService = config.applicationService;
    if (applicationService) {
        await applicationService.importLegacyPersonal({
            appIdRef: config.appIdEnv,
            appSecretRef: config.appSecretEnv,
            domain: config.baseURL?.includes('larksuite') ? 'lark' : 'feishu',
            name: config.appName,
        });
    }
    const lark = (internals.createLarkcli ?? createLarkcli)({
        profile: config.profile,
        baseURL: config.baseURL,
    });
    // ---- connection-flow state machine (one flow at a time) -----------------
    const state = { phase: 'idle' };
    let flowAbort;
    let suppressAuthorizedReconcile = false;
    const phaseWaiters = new Set();
    // Materialize the official lark-* skills once the binary is present (i.e. on
    // a successful connect). Best-effort and deduped: it must never fail a
    // connection, and its own version stamp makes repeat calls cheap. Because a
    // missing `lark-shared/SKILL.md` forces re-materialization, this also self-
    // heals whenever a user deletes the managed skills.
    let skillsInFlight;
    function materializeSkillsInBackground() {
        if (skillsInFlight !== undefined)
            return;
        skillsInFlight = ensureSkillsImpl()
            .then((result) => {
            if (!result.skipped) {
                ctx.logger.info('materialized %d lark skills (%s) into %s', result.count, result.version, result.root);
            }
        })
            .catch((error) => {
            ctx.logger.warn('lark skill materialization failed: %s', error instanceof Error ? error.message : String(error));
        })
            .finally(() => { skillsInFlight = undefined; });
    }
    function setState(next) {
        state.phase = next.phase;
        state.qrUrl = next.qrUrl;
        state.authorizeUrl = next.authorizeUrl;
        state.message = next.message;
        if (Object.hasOwn(next, 'applicationId'))
            state.applicationId = next.applicationId;
        if (next.openId !== undefined)
            state.openId = next.openId;
        if (next.phase === 'connected' || next.phase === 'error' || next.phase === 'idle')
            suppressAuthorizedReconcile = false;
        if (next.phase === 'connected')
            materializeSkillsInBackground();
        for (const wake of phaseWaiters)
            wake();
        phaseWaiters.clear();
    }
    // Plugin disposal cancels any in-flight flow.
    ctx.effect(() => () => { flowAbort?.abort(); });
    function sleep(ms, signal) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { resolve(); }, ms);
            signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('Feishu connection flow cancelled'));
            }, { once: true });
        });
    }
    /** Connected-state message, naming the user (falling back to cached identity). */
    async function connectedMessage(status) {
        let name = status.userName;
        if (name === undefined)
            name = (await readIdentityImpl(config.profile))?.userName;
        return name === undefined
            ? 'Feishu is connected with your personal identity.'
            : `Feishu is connected as ${name}.`;
    }
    /**
     * Persist a non-secret record of who is connected. The user token is never
     * written here — lark-cli keeps that in the OS keychain and stays the source
     * of truth. Best-effort: a failed write must not fail the connection.
     */
    async function recordIdentity(status) {
        const record = { profile: config.profile, connectedAt: new Date().toISOString() };
        if (status.userName !== undefined)
            record.userName = status.userName;
        if (status.openId !== undefined)
            record.openId = status.openId;
        await writeIdentityImpl(record).catch(() => { });
    }
    async function legacyStoredCredentials(domain) {
        const id = await ctx.credentials.resolve(appIdRef);
        const secret = await ctx.credentials.resolve(appSecretRef);
        if (!id?.value || !secret?.value)
            return undefined;
        return { appId: id.value, appSecret: secret.value, domain };
    }
    function selectApplication(applicationId, createNew) {
        if (!applicationService || createNew)
            return undefined;
        const applications = applicationService.listPublic();
        return selectPersonalApplication({
            applications,
            selectedApplication: applicationService.getPersonalApplication(),
            applicationId,
            createNew,
        });
    }
    async function authorizeApplication(application, domain, signal) {
        const credentials = applicationService
            ? await applicationService.resolveCredentials(application.applicationId)
            : await legacyStoredCredentials(domain);
        if (!credentials)
            return false;
        await lark.provision();
        await lark.configInit(credentials.appId, credentials.appSecret, credentials.domain, signal);
        const begin = await lark.loginBegin(signal);
        setState({
            phase: 'authorizing',
            applicationId: application?.applicationId ?? null,
            authorizeUrl: begin.verificationUrl,
            message: 'Open this link and confirm to grant your personal Feishu identity.',
        });
        const status = await lark.loginComplete(begin.deviceCode, signal);
        if (applicationService && application)
            await applicationService.selectPersonal(application.applicationId);
        await recordIdentity(status);
        setState({
            phase: 'connected',
            applicationId: application?.applicationId ?? null,
            message: await connectedMessage(status),
        });
        return true;
    }
    /** Full one-click flow: register a brand-new app, bind it, then authorize. */
    async function registerAndAuthorize(domain, signal) {
        const session = await beginRegistrationImpl({
            domain,
            appName: config.appName,
            appDesc: config.appDesc,
            tenantScopes: TENANT_SCOPES,
            userScopes: USER_SCOPES,
            signal,
        });
        setState({
            phase: 'creating',
            qrUrl: session.qrUrl,
            message: 'Waiting for the user to open the link and confirm app creation.',
        });
        // Poll until the created app's credentials arrive.
        let appId, appSecret, appDomain;
        for (;;) {
            await sleep(session.intervalSec * 1000, signal);
            const outcome = await pollRegistrationImpl(session, signal);
            if (outcome.status === 'pending')
                continue;
            if (outcome.status !== 'success') {
                setState({ phase: 'error', message: outcome.message });
                return;
            }
            appId = outcome.appId;
            appSecret = outcome.appSecret;
            appDomain = outcome.domain;
            setState({
                phase: 'creating',
                qrUrl: session.qrUrl,
                message: 'App created; preparing the local authorization tool…',
                ...outcome.openId === undefined ? {} : { openId: outcome.openId },
            });
            break;
        }
        const application = applicationService
            ? await applicationService.storeApplication({
                appId,
                appSecret,
                domain: appDomain,
                name: config.appName,
            })
            : undefined;
        if (!applicationService) {
            await ctx.credentials.set(appIdRef, appId);
            await ctx.credentials.set(appSecretRef, appSecret);
        }
        // Provision the pinned lark-cli binary (first run downloads ~12 MB) and
        // bind the created app's credentials to the profile.
        await lark.provision();
        await lark.configInit(appId, appSecret, appDomain, signal);
        // Drive lark-cli's built-in device-code login: it returns the second link
        // for the user to open, then blocks until they authorize in the browser.
        const begin = await lark.loginBegin(signal);
        setState({
            phase: 'authorizing',
            applicationId: application?.applicationId ?? null,
            authorizeUrl: begin.verificationUrl,
            message: 'App created. Open this link and confirm to grant your personal Feishu identity.',
        });
        const status = await lark.loginComplete(begin.deviceCode, signal);
        if (applicationService && application)
            await applicationService.selectPersonal(application.applicationId);
        await recordIdentity(status);
        setState({
            phase: 'connected',
            applicationId: application?.applicationId ?? null,
            message: await connectedMessage(status),
        });
    }
    /**
     * Drive the connection idempotently. Without `force`: an existing valid
     * connection is reused as-is (no link), an already-created app skips straight
     * to the single authorization link, and only a first-time connection shows
     * both links. With `force`: the current user session is dropped and personal
     * authorization is re-run (reusing the app) so a different identity can sign
     * in.
     */
    async function runConnectFlow(domain, force, applicationId, createNew, signal) {
        const selectedBefore = applicationService?.getPersonalApplication();
        const target = selectApplication(applicationId, createNew);
        const current = await lark.status(signal).catch(() => undefined);
        const switchingApplication = Boolean(applicationService
            && target
            && selectedBefore?.applicationId !== target.applicationId);
        if (!force && !switchingApplication && !createNew && current?.connected === true) {
            await recordIdentity(current);
            setState({
                phase: 'connected',
                applicationId: selectedBefore?.applicationId ?? target?.applicationId ?? null,
                message: await connectedMessage(current),
            });
            return;
        }
        if ((force || switchingApplication || createNew) && current !== undefined)
            await lark.logout(signal);
        suppressAuthorizedReconcile = false;
        if (target && await authorizeApplication(target, domain, signal))
            return;
        if (!applicationService) {
            const appConfigured = (await ctx.credentials.describe(appIdRef)).configured;
            if (appConfigured && await authorizeApplication(undefined, domain, signal))
                return;
        }
        await registerAndAuthorize(domain, signal);
    }
    function startConnect(domain, force, { applicationId, createNew = false } = {}) {
        flowAbort?.abort();
        const controller = new AbortController();
        flowAbort = controller;
        suppressAuthorizedReconcile = shouldSuppressAuthorizedReconcile({
            force,
            createNew,
            applicationId,
            applications: applicationService?.listPublic() ?? [],
            selectedApplication: applicationService?.getPersonalApplication(),
        });
        setState({
            phase: 'creating',
            applicationId: applicationId ?? null,
            message: 'Checking existing Feishu connection…',
        });
        runConnectFlow(domain, force, applicationId, createNew, controller.signal).catch((error) => {
            if (controller.signal.aborted)
                return;
            setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
        });
    }
    function statusSnapshot() {
        return {
            phase: state.phase,
            qrUrl: state.qrUrl ?? null,
            authorizeUrl: state.authorizeUrl ?? null,
            message: state.message ?? null,
            applicationId: state.applicationId ?? null,
        };
    }
    async function describeConfigured(verify = false) {
        const applications = applicationService?.listPublic() ?? [];
        const selectedApplication = applicationService?.getPersonalApplication() ?? null;
        const app = applicationService ? null : await ctx.credentials.describe(appIdRef);
        let liveUserStatus;
        let userAuthorized = false;
        try {
            liveUserStatus = await lark.status(undefined, { verify });
            userAuthorized = liveUserStatus?.connected ?? false;
        }
        catch { /* lark-cli not ready yet → not authorized */ }
        return {
            appConfigured: applicationService ? selectedApplication !== null : app.configured,
            userAuthorized,
            applications,
            selectedApplication,
            selectedApplicationId: selectedApplication?.applicationId ?? null,
            selectionRequired: selectedApplication === null && applications.length > 1,
            sharedWithBot: (selectedApplication?.botCount ?? 0) > 0,
            liveUserStatus,
        };
    }
    /**
     * Merge live flow state with configured/authorized truth. After a restart the
     * in-memory phase is `idle` but lark-cli may still hold a valid session, so
     * normalize that to `connected` for an honest snapshot.
     */
    async function fullStatus(includeApplications = false, verify = false) {
        const configured = await describeConfigured(verify);
        let snapshot = statusSnapshot();
        if (configured.userAuthorized && applicationService && configured.selectedApplication === null) {
            const liveApplication = configured.liveUserStatus?.appId === undefined
                || typeof applicationService.findPublicByAppId !== 'function'
                ? null
                : applicationService.findPublicByAppId(configured.liveUserStatus.appId);
            const flowApplication = snapshot.applicationId === null
                ? null
                : applicationService.getPublic(snapshot.applicationId);
            const inferredApplication = inferAuthorizedApplication({
                liveApplication,
                flowApplication,
                applications: configured.applications,
            });
            if (inferredApplication !== null) {
                configured.selectedApplication = await applicationService.selectPersonal(
                    inferredApplication.applicationId,
                );
                configured.applications = applicationService.listPublic();
                configured.selectedApplicationId = configured.selectedApplication.applicationId;
                configured.appConfigured = true;
                configured.selectionRequired = false;
                configured.sharedWithBot = configured.selectedApplication.botCount > 0;
            }
        }
        const {
            applications,
            selectedApplication,
            liveUserStatus,
            ...publicConfigured
        } = configured;
        if (shouldReconcileAuthorizedFlow({
            userAuthorized: configured.userAuthorized,
            suppressAuthorizedReconcile,
            phase: snapshot.phase,
        })) {
            flowAbort?.abort();
            flowAbort = undefined;
            await recordIdentity(liveUserStatus ?? { connected: true });
            setState({
                phase: 'connected',
                applicationId: selectedApplication?.applicationId ?? snapshot.applicationId ?? null,
                message: await connectedMessage(liveUserStatus ?? { connected: true }),
            });
            snapshot = statusSnapshot();
        }
        return {
            ...snapshot,
            ...publicConfigured,
            ...(includeApplications ? { applications, selectedApplication, liveUserStatus } : {}),
        };
    }
    /** Browser-only status metadata. No credential or token value crosses RPC. */
    async function settingsStatus() {
        const status = await fullStatus(true, true);
        const { liveUserStatus, ...publicStatus } = status;
        const identity = await readIdentityImpl(config.profile);
        const skills = await inspectSkillsImpl().catch(() => ({ available: false, count: 0, names: [] }));
        const capabilityStatus = buildCapabilityStatus(liveUserStatus, skills);
        return {
            ...publicStatus,
            ...capabilityStatus,
            appName: publicStatus.selectedApplication?.name ?? config.appName,
            profile: config.profile,
            userName: identity?.userName ?? null,
        };
    }
    async function disconnectPersonal() {
        flowAbort?.abort();
        flowAbort = undefined;
        await lark.logout();
        await clearIdentityImpl(config.profile).catch(() => { });
        if (applicationService)
            await applicationService.detachPersonal();
        setState({
            phase: 'idle',
            applicationId: null,
            message: 'Personal Feishu authorization was removed. The application remains available.',
        });
        return settingsStatus();
    }
    /** Fail domain tools early with an actionable message when not connected. */
    async function assertConnected(signal) {
        let status;
        try {
            status = await lark.status(signal);
        }
        catch {
            status = undefined;
        }
        if (status?.connected !== true) {
            throw new Error('Feishu is not connected yet. Call the feishu_connect tool (or run /feishu-connect) '
                + 'to create and authorize a Feishu app in one click.');
        }
    }
    // ---- connection tools (the model drives the onboarding) ----------------
    const statusOutput = {
        type: 'object',
        properties: {
            phase: { type: 'string', required: true, enum: ['idle', 'creating', 'authorizing', 'connected', 'error'] },
            qrUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            authorizeUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            message: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            applicationId: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            appConfigured: { type: 'boolean', required: true },
            userAuthorized: { type: 'boolean', required: true },
            selectedApplicationId: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            selectionRequired: { type: 'boolean', required: true },
            sharedWithBot: { type: 'boolean', required: true },
        },
        additionalProperties: false,
    };
    function renderStatus(value) {
        const lines = [`Feishu connection phase: ${value.phase}`];
        if (value.qrUrl !== null && value.phase === 'creating') {
            lines.push(`Ask the user to open this link to create the app in one click: ${value.qrUrl}`);
        }
        if (value.authorizeUrl !== null && value.phase === 'authorizing') {
            lines.push(`Ask the user to open this link and confirm to grant personal authorization: ${value.authorizeUrl}`);
        }
        if (value.message !== null)
            lines.push(value.message);
        if (value.selectionRequired)
            lines.push('Multiple Feishu applications are available; choose one application_id or create a new application.');
        lines.push(`app configured: ${value.appConfigured}, personal identity authorized: ${value.userAuthorized}`);
        return [{ type: 'text', text: lines.join('\n') }];
    }
    ctx.tools.register(defineTool({
        name: 'feishu_connect',
        description: 'Connect Feishu (Lark) with one-click onboarding: creates a Feishu app with all needed '
            + 'permissions pre-granted and starts personal (device-code) authorization. Returns a link the user '
            + 'opens in a browser — show it to the user, then follow the flow with feishu_status. Idempotent: if '
            + 'Feishu is already connected it returns connected with no link, and a returning user who only needs '
            + 'to re-authorize gets a single link (the existing app is reused). Pass force=true to re-authorize as '
            + 'a different account. Use when the user wants to connect Feishu or a Feishu tool reports missing '
            + 'credentials.',
        parameters: {
            domain: {
                type: 'string',
                enum: ['feishu', 'lark'],
                description: 'feishu = China (default), lark = international tenants',
            },
            force: {
                type: 'boolean',
                description: 'Re-run personal authorization even if already connected, to switch account '
                    + '(reuses the existing app). Default false: reuse the current connection.',
            },
            application_id: {
                type: 'string',
                description: 'Existing shared Feishu application id. Required only when more than one application exists.',
            },
            create_new_application: {
                type: 'boolean',
                description: 'Create an independent Feishu application instead of reusing an existing one.',
            },
        },
        output: {
            schema: statusOutput,
            render: (_args, value) => renderStatus(value),
        },
        async execute(args) {
            if (args.application_id !== undefined && args.create_new_application === true) {
                throw new Error('application_id and create_new_application cannot be used together');
            }
            startConnect(args.domain ?? 'feishu', args.force ?? false, {
                applicationId: args.application_id,
                createNew: args.create_new_application ?? false,
            });
            // Wait until the flow leaves the initial check: a link appears, it
            // short-circuits to connected, or it fails.
            for (let i = 0; i < 100 && state.phase === 'creating' && state.qrUrl === undefined; i++) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            return await fullStatus();
        },
    }));
    ctx.tools.register(defineTool({
        name: 'feishu_status',
        description: 'Check the Feishu connection flow. Long-polls: waits up to wait_seconds for the phase to '
            + 'change before returning. Call this after feishu_connect until phase is connected (relay each new '
            + 'link to the user) or error.',
        parameters: {
            wait_seconds: { type: 'integer', description: 'Max seconds to wait for a phase change (default 20)' },
        },
        output: {
            schema: statusOutput,
            render: (_args, value) => renderStatus(value),
        },
        async execute(args, exec) {
            const waitMs = Math.min(Math.max(args.wait_seconds ?? 20, 0), 120) * 1000;
            const before = state.phase;
            if (waitMs > 0 && (before === 'creating' || before === 'authorizing')) {
                await new Promise((resolve) => {
                    const timer = setTimeout(() => { phaseWaiters.delete(wake); resolve(); }, waitMs);
                    const wake = () => { clearTimeout(timer); resolve(); };
                    phaseWaiters.add(wake);
                    exec.signal.addEventListener('abort', () => {
                        clearTimeout(timer);
                        phaseWaiters.delete(wake);
                        resolve();
                    }, { once: true });
                });
            }
            return await fullStatus();
        },
    }));
    // ---- domain tools (act as the personal identity via `lark-cli api`) -----
    ctx.tools.register(defineTool({
        name: 'feishu_create_doc',
        description: 'Create a new (empty) Feishu docx document and return its id and URL. '
            + 'If Feishu is not connected yet, use feishu_connect first.',
        parameters: {
            title: { type: 'string', required: true, description: 'Document title' },
            folder_token: { type: 'string', description: 'Destination folder token; omit for the root folder' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    documentId: { type: 'string', required: true },
                    title: { type: 'string', required: true },
                    url: { type: 'string', required: true },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [{ type: 'text', text: `Created Feishu doc "${value.title}": ${value.url}` }],
        },
        async execute(args, exec) {
            await assertConnected(exec.signal);
            const data = await lark.api('POST', '/open-apis/docx/v1/documents', { as: 'user', data: { title: args.title, ...args.folder_token === undefined ? {} : { folder_token: args.folder_token } } }, exec.signal);
            const documentId = data.document.document_id;
            const origin = new URL(config.baseURL).origin.replace('open.', '');
            return { documentId, title: data.document.title, url: `${origin}/docx/${documentId}` };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'feishu_send_message',
        description: 'Send a plain-text Feishu message to a user or group chat. '
            + 'If Feishu is not connected yet, use feishu_connect first.',
        parameters: {
            receive_id_type: {
                type: 'string',
                required: true,
                enum: ['open_id', 'user_id', 'email', 'chat_id'],
                description: 'Which id space receive_id belongs to',
            },
            receive_id: { type: 'string', required: true, description: 'Target user or chat id' },
            text: { type: 'string', required: true, description: 'Message body' },
        },
        output: {
            schema: {
                type: 'object',
                properties: { messageId: { type: 'string', required: true } },
                additionalProperties: false,
            },
            render: (_args, value) => [{ type: 'text', text: `Sent Feishu message ${value.messageId}` }],
        },
        async execute(args, exec) {
            await assertConnected(exec.signal);
            const data = await lark.api('POST', '/open-apis/im/v1/messages', {
                as: 'user',
                params: { receive_id_type: args.receive_id_type },
                data: { receive_id: args.receive_id, msg_type: 'text', content: JSON.stringify({ text: args.text }) },
            }, exec.signal);
            return { messageId: data.message_id };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'feishu_create_bitable',
        description: 'Create a new Feishu Base (多维表格 / Bitable) app and return its token and URL. '
            + 'If Feishu is not connected yet, use feishu_connect first.',
        parameters: {
            name: { type: 'string', required: true, description: 'Base name' },
            folder_token: { type: 'string', description: 'Destination folder token; omit for the root folder' },
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    appToken: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                    url: { type: 'string', required: true },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [{ type: 'text', text: `Created Feishu Base "${value.name}": ${value.url}` }],
        },
        async execute(args, exec) {
            await assertConnected(exec.signal);
            const data = await lark.api('POST', '/open-apis/bitable/v1/apps', { as: 'user', data: { name: args.name, ...args.folder_token === undefined ? {} : { folder_token: args.folder_token } } }, exec.signal);
            const origin = new URL(config.baseURL).origin.replace('open.', '');
            return {
                appToken: data.app.app_token,
                name: data.app.name ?? args.name,
                url: data.app.url ?? `${origin}/base/${data.app.app_token}`,
            };
        },
    }));
    // ---- human commands (same flow without going through the model) --------
    ctx.inject(['commands'], (commandCtx) => {
        commandCtx.commands.register({
            name: 'feishu-connect',
            description: 'One-click Feishu connection: reuses an existing connection, or creates the app and starts '
                + 'personal device-code authorization. Add "force" to re-authorize as a different account.',
            input: { hint: '[lark] [force]' },
            async handler({ rawInput }) {
                const tokens = rawInput.trim().toLowerCase().split(/\s+/).filter(Boolean);
                const domain = tokens.includes('lark') ? 'lark' : 'feishu';
                const force = tokens.includes('force');
                startConnect(domain, force);
                for (let i = 0; i < 100 && state.phase === 'creating' && state.qrUrl === undefined; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                if (state.phase === 'error') {
                    return { kind: 'error', text: state.message ?? 'Feishu connection failed' };
                }
                if (state.phase === 'connected') {
                    return { kind: 'success', text: state.message ?? 'Feishu is already connected.' };
                }
                if (state.authorizeUrl !== undefined) {
                    return {
                        kind: 'success',
                        text: `Open this link and confirm to grant personal authorization:\n${state.authorizeUrl}\n`
                            + 'Then run /feishu-status to finish.',
                    };
                }
                return {
                    kind: 'success',
                    text: `Open this link to create the Feishu app in one click:\n${state.qrUrl ?? '(pending…)'}\n`
                        + 'Then run /feishu-status to follow the flow (a second link completes personal authorization).',
                };
            },
        });
        commandCtx.commands.register({
            name: 'feishu-status',
            description: 'Show Feishu connection progress and any link waiting for you.',
            async handler() {
                const text = renderStatus(await fullStatus())
                    .map((block) => block.text).join('\n');
                return { kind: 'success', text };
            },
        });
        commandCtx.commands.register({
            name: 'feishu-skills-refresh',
            description: 'Re-download the lark-cli binary if newer, then re-materialize the official lark-* skills '
                + '(version-matched). Normally automatic on connect; use this to force an update.',
            async handler() {
                try {
                    const result = await ensureSkillsImpl(true);
                    return {
                        kind: 'success',
                        text: `Materialized ${result.count} lark skills (${result.version}) into ${result.root}.`,
                    };
                }
                catch (error) {
                    return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
                }
            },
        });
    });
    // The browser settings surface is optional. Headless deployments keep the
    // tools and commands above without exposing a web RPC channel.
    ctx.inject(['connection'], (uiCtx) => {
        uiCtx.effect(() => uiCtx.connection.rpc.handle('/tokens-feishu-connect', async (endpoint, payload) => {
            if (endpoint === 'feishu/status') {
                return { ok: true, value: await settingsStatus() };
            }
            if (endpoint === 'feishu/connect') {
                if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
                    return {
                        ok: false,
                        error: { code: 'bad-request', message: 'invalid Feishu connect request', details: { issues: [] } },
                    };
                }
                const input = payload;
                const keys = Object.keys(input);
                const domain = input.domain;
                const force = input.force;
                const applicationId = input.applicationId;
                const createNew = input.createNew;
                if (keys.some((key) => !['domain', 'force', 'applicationId', 'createNew'].includes(key))
                    || (domain !== 'feishu' && domain !== 'lark')
                    || typeof force !== 'boolean'
                    || (applicationId !== undefined
                        && (typeof applicationId !== 'string'
                            || !/^[A-Za-z0-9_-]{1,128}$/.test(applicationId)))
                    || (createNew !== undefined && typeof createNew !== 'boolean')
                    || (applicationId !== undefined && createNew === true)) {
                    return {
                        ok: false,
                        error: { code: 'bad-request', message: 'invalid Feishu connect request', details: { issues: [] } },
                    };
                }
                startConnect(domain, force, { applicationId, createNew: createNew ?? false });
                return { ok: true, value: await settingsStatus() };
            }
            if (endpoint === 'feishu/disconnect') {
                if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
                    || Object.keys(payload).length !== 1 || payload.confirm !== true) {
                    return {
                        ok: false,
                        error: { code: 'bad-request', message: 'invalid Feishu disconnect request', details: { issues: [] } },
                    };
                }
                return { ok: true, value: await disconnectPersonal() };
            }
            return {
                ok: false,
                error: { code: 'internal', message: `unknown endpoint ${endpoint}`, details: {} },
            };
        }, { authority: 'trusted-host' }), 'feishu: settings rpc channel');
    });
}
