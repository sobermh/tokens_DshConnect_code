import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_SECRET_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;

function cleanString(value, maxLength = 4_096) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function normalizeDomain(value) {
  return value === 'lark' ? 'lark' : 'feishu';
}

function uniqueSafeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && SAFE_ID.test(item)))];
}

export function feishuApplicationId(appId) {
  const normalized = cleanString(appId, 256);
  if (!normalized) throw new TypeError('Feishu App ID is required');
  return `app_${createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`;
}

export function feishuApplicationSecretRef(appId) {
  return `DSH_FEISHU_APP_SECRET_${feishuApplicationId(appId).slice(4).toUpperCase()}`;
}

function normalizeApplication(value) {
  if (!value || typeof value !== 'object') return null;
  const appId = cleanString(value.appId, 256);
  if (!appId) return null;
  const id = cleanString(value.id, 128) ?? feishuApplicationId(appId);
  const secretRef = cleanString(value.secretRef, 256);
  if (!SAFE_ID.test(id) || !secretRef || !SAFE_SECRET_REF.test(secretRef)) return null;
  const createdAt = cleanString(value.createdAt, 64) ?? new Date(0).toISOString();
  return Object.freeze({
    id,
    appId,
    secretRef,
    domain: normalizeDomain(value.domain),
    name: cleanString(value.name, 256),
    botIds: Object.freeze(uniqueSafeIds(value.botIds)),
    personal: value.personal === true,
    createdAt,
    updatedAt: cleanString(value.updatedAt, 64) ?? createdAt,
  });
}

function normalizeDocument(value) {
  if (!value || typeof value !== 'object' || value.version !== 1
    || !Array.isArray(value.applications)) return null;
  const applications = value.applications.map(normalizeApplication);
  if (applications.some((application) => application === null)) return null;
  const ids = new Set();
  const appIds = new Set();
  const refs = new Set();
  let personalCount = 0;
  for (const application of applications) {
    if (ids.has(application.id) || appIds.has(application.appId) || refs.has(application.secretRef)) {
      return null;
    }
    ids.add(application.id);
    appIds.add(application.appId);
    refs.add(application.secretRef);
    if (application.personal) personalCount += 1;
  }
  if (personalCount > 1) return null;
  return Object.freeze({ version: 1, applications: Object.freeze(applications) });
}

/** Persists non-secret Feishu application metadata and consumer relationships. */
export class FeishuApplicationRegistry {
  #path;
  #value = Object.freeze({ version: 1, applications: Object.freeze([]) });
  #writeQueue = Promise.resolve();

  constructor(path) {
    const normalized = cleanString(path);
    if (!normalized) throw new TypeError('Feishu application registry path is required');
    this.#path = normalized;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8'));
      const normalized = normalizeDocument(parsed);
      if (!normalized) throw new Error('Feishu application registry is invalid');
      this.#value = normalized;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.#value = Object.freeze({ version: 1, applications: Object.freeze([]) });
    }
    return this;
  }

  list() {
    return structuredClone(this.#value.applications);
  }

  async replace(applications) {
    const document = normalizeDocument({ version: 1, applications });
    if (!document) throw new Error('Refusing to persist an invalid Feishu application registry');
    const operation = this.#writeQueue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      const temporary = `${this.#path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await rename(temporary, this.#path);
      this.#value = document;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return this.list();
  }
}

function maskedAppId(appId) {
  return appId.length > 12
    ? `${appId.slice(0, 8)}••••${appId.slice(-4)}`
    : 'cli_••••';
}

function publicApplication(application) {
  return {
    applicationId: application.id,
    name: application.name ?? '飞书自建应用',
    appIdMasked: maskedAppId(application.appId),
    domain: application.domain,
    botIds: [...application.botIds],
    botCount: application.botIds.length,
    usedByPersonal: application.personal,
  };
}

function requireApplicationId(value) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new TypeError('Invalid Feishu application id');
  }
  return value;
}

function applicationRecord({
  previous,
  appId,
  secretRef,
  domain,
  name,
  botIds,
  personal,
}) {
  const now = new Date().toISOString();
  return {
    id: previous?.id ?? feishuApplicationId(appId),
    appId,
    secretRef,
    domain: normalizeDomain(domain ?? previous?.domain),
    name: cleanString(name, 256) ?? previous?.name ?? null,
    botIds: [...new Set(botIds ?? previous?.botIds ?? [])],
    personal: personal ?? previous?.personal ?? false,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Coordinates one credential reference per Feishu application for all consumers. */
export class FeishuApplicationService {
  #registry;
  #credentials;
  #transition = Promise.resolve();

  constructor({ registry, credentials } = {}) {
    if (!registry || typeof registry.list !== 'function' || typeof registry.replace !== 'function') {
      throw new TypeError('Feishu application registry is required');
    }
    if (!credentials
      || typeof credentials.resolve !== 'function'
      || typeof credentials.set !== 'function'
      || typeof credentials.unset !== 'function') {
      throw new TypeError('DSH credentials service is required');
    }
    this.#registry = registry;
    this.#credentials = credentials;
  }

  listPublic() {
    return this.#registry.list().map(publicApplication);
  }

  getPublic(applicationId) {
    const id = requireApplicationId(applicationId);
    const application = this.#registry.list().find((candidate) => candidate.id === id);
    return application ? publicApplication(application) : null;
  }

  findPublicByAppId(appId) {
    const normalized = cleanString(appId, 256);
    if (!normalized) return null;
    const application = this.#registry.list().find((candidate) => candidate.appId === normalized);
    return application ? publicApplication(application) : null;
  }

  getPersonalApplication() {
    const application = this.#registry.list().find((candidate) => candidate.personal);
    return application ? publicApplication(application) : null;
  }

  async resolveCredentials(applicationId) {
    const id = requireApplicationId(applicationId);
    const application = this.#registry.list().find((candidate) => candidate.id === id);
    if (!application) throw new Error('Unknown Feishu application');
    const secret = await this.#credentials.resolve(application.secretRef);
    if (!secret?.value) {
      const error = new Error('The Feishu application credential is missing');
      error.code = 'missing_application_credentials';
      throw error;
    }
    return {
      applicationId: application.id,
      appId: application.appId,
      appSecret: secret.value,
      secretRef: application.secretRef,
      domain: application.domain,
      name: application.name,
    };
  }

  async storeApplication({ appId, appSecret, domain, name, preferredSecretRef } = {}) {
    const normalizedAppId = cleanString(appId, 256);
    const normalizedSecret = cleanString(appSecret, 4_096);
    if (!normalizedAppId || !normalizedSecret) {
      throw new TypeError('Feishu App ID and App Secret are required');
    }
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      const index = applications.findIndex((candidate) => candidate.appId === normalizedAppId);
      const previous = index === -1 ? null : applications[index];
      const candidateRef = cleanString(preferredSecretRef, 256);
      const secretRef = previous?.secretRef
        ?? (candidateRef && SAFE_SECRET_REF.test(candidateRef)
          ? candidateRef
          : feishuApplicationSecretRef(normalizedAppId));
      const previousSecret = await this.#credentials.resolve(secretRef).catch(() => undefined);
      await this.#credentials.set(secretRef, normalizedSecret);
      const next = applicationRecord({
        previous,
        appId: normalizedAppId,
        secretRef,
        domain,
        name,
      });
      try {
        if (index === -1) applications.push(next);
        else applications[index] = next;
        await this.#registry.replace(applications);
      } catch (error) {
        await this.#restoreSecret(secretRef, previousSecret).catch(() => undefined);
        throw error;
      }
      return publicApplication(next);
    });
  }

  async importBot(config) {
    if (!config || typeof config !== 'object') throw new TypeError('Feishu bot config is required');
    const botId = requireApplicationId(config.id);
    const appId = cleanString(config.appId, 256);
    const incomingRef = cleanString(config.secretRef, 256);
    if (!appId || !incomingRef || !SAFE_SECRET_REF.test(incomingRef)) {
      throw new TypeError('Feishu bot config has invalid application credentials');
    }
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      let index = applications.findIndex((candidate) => candidate.appId === appId);
      const previous = index === -1 ? null : applications[index];
      const secretRef = previous?.secretRef ?? incomingRef;
      if (secretRef !== incomingRef) {
        const [canonical, incoming] = await Promise.all([
          this.#credentials.resolve(secretRef).catch(() => undefined),
          this.#credentials.resolve(incomingRef).catch(() => undefined),
        ]);
        if (incoming?.value && incoming.value !== canonical?.value) {
          await this.#credentials.set(secretRef, incoming.value);
        }
      }
      for (let applicationIndex = 0; applicationIndex < applications.length; applicationIndex += 1) {
        const application = applications[applicationIndex];
        if (!application.botIds.includes(botId)) continue;
        applications[applicationIndex] = applicationRecord({
          previous: application,
          appId: application.appId,
          secretRef: application.secretRef,
          botIds: application.botIds.filter((candidate) => candidate !== botId),
        });
      }
      const next = applicationRecord({
        previous,
        appId,
        secretRef,
        domain: config.domain,
        name: config.botName,
        botIds: [...(previous?.botIds ?? []).filter((candidate) => candidate !== botId), botId],
      });
      index = applications.findIndex((candidate) => candidate.appId === appId);
      if (index === -1) applications.push(next);
      else applications[index] = next;
      await this.#registry.replace(applications);
      return { ...publicApplication(next), secretRef, legacySecretRef: incomingRef };
    });
  }

  async attachBot(applicationId, botId) {
    const id = requireApplicationId(applicationId);
    const normalizedBotId = requireApplicationId(botId);
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      const targetIndex = applications.findIndex((candidate) => candidate.id === id);
      if (targetIndex === -1) throw new Error('Unknown Feishu application');
      for (let index = 0; index < applications.length; index += 1) {
        const application = applications[index];
        const botIds = application.botIds.filter((candidate) => candidate !== normalizedBotId);
        applications[index] = applicationRecord({
          previous: application,
          appId: application.appId,
          secretRef: application.secretRef,
          botIds: index === targetIndex ? [...botIds, normalizedBotId] : botIds,
        });
      }
      await this.#registry.replace(applications);
      return publicApplication(applications[targetIndex]);
    });
  }

  async detachBot(botId) {
    const normalizedBotId = requireApplicationId(botId);
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      let changed = false;
      for (let index = 0; index < applications.length; index += 1) {
        const application = applications[index];
        if (!application.botIds.includes(normalizedBotId)) continue;
        changed = true;
        applications[index] = applicationRecord({
          previous: application,
          appId: application.appId,
          secretRef: application.secretRef,
          botIds: application.botIds.filter((candidate) => candidate !== normalizedBotId),
        });
      }
      if (changed) await this.#registry.replace(applications);
      return this.listPublic();
    });
  }

  async reconcileBotConsumers(botIds) {
    const configured = new Set(uniqueSafeIds(botIds));
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      let changed = false;
      for (let index = 0; index < applications.length; index += 1) {
        const application = applications[index];
        const retained = application.botIds.filter((botId) => configured.has(botId));
        if (retained.length === application.botIds.length) continue;
        changed = true;
        applications[index] = applicationRecord({
          previous: application,
          appId: application.appId,
          secretRef: application.secretRef,
          botIds: retained,
        });
      }
      if (changed) await this.#registry.replace(applications);
      return this.listPublic();
    });
  }

  async selectPersonal(applicationId) {
    const id = requireApplicationId(applicationId);
    await this.resolveCredentials(id);
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      const targetIndex = applications.findIndex((candidate) => candidate.id === id);
      if (targetIndex === -1) throw new Error('Unknown Feishu application');
      for (let index = 0; index < applications.length; index += 1) {
        const application = applications[index];
        applications[index] = applicationRecord({
          previous: application,
          appId: application.appId,
          secretRef: application.secretRef,
          personal: index === targetIndex,
        });
      }
      await this.#registry.replace(applications);
      return publicApplication(applications[targetIndex]);
    });
  }

  async detachPersonal() {
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      let changed = false;
      for (let index = 0; index < applications.length; index += 1) {
        const application = applications[index];
        if (!application.personal) continue;
        changed = true;
        applications[index] = applicationRecord({
          previous: application,
          appId: application.appId,
          secretRef: application.secretRef,
          personal: false,
        });
      }
      if (changed) await this.#registry.replace(applications);
      return this.listPublic();
    });
  }

  async importLegacyPersonal({ appIdRef, appSecretRef, domain, name } = {}) {
    const idRef = cleanString(appIdRef, 256);
    const secretRef = cleanString(appSecretRef, 256);
    if (!idRef || !secretRef) throw new TypeError('Legacy Feishu credential references are required');
    const [legacyId, legacySecret] = await Promise.all([
      this.#credentials.resolve(idRef).catch(() => undefined),
      this.#credentials.resolve(secretRef).catch(() => undefined),
    ]);
    if (!legacyId?.value || !legacySecret?.value) return this.getPersonalApplication();

    const appId = cleanString(legacyId.value, 256);
    if (!appId) return this.getPersonalApplication();
    const existing = this.#registry.list().find((candidate) => candidate.appId === appId);
    let application;
    if (existing) {
      const canonical = await this.#credentials.resolve(existing.secretRef).catch(() => undefined);
      if (!canonical?.value) await this.#credentials.set(existing.secretRef, legacySecret.value);
      application = await this.selectPersonal(existing.id);
    } else {
      application = await this.storeApplication({
        appId,
        appSecret: legacySecret.value,
        domain,
        name,
        preferredSecretRef: secretRef,
      });
      application = await this.selectPersonal(application.applicationId);
    }

    await this.#credentials.unset(idRef).catch(() => undefined);
    if (existing && existing.secretRef !== secretRef) {
      await this.#credentials.unset(secretRef).catch(() => undefined);
    }
    return application;
  }

  async releaseLegacySecretRef(secretRef, applicationId) {
    const ref = cleanString(secretRef, 256);
    const id = requireApplicationId(applicationId);
    const application = this.#registry.list().find((candidate) => candidate.id === id);
    if (!ref || !application || application.secretRef === ref) return;
    await this.#credentials.unset(ref).catch(() => undefined);
  }

  async deleteUnusedApplication(applicationId) {
    const id = requireApplicationId(applicationId);
    return this.#serialize(async () => {
      const applications = this.#registry.list();
      const index = applications.findIndex((candidate) => candidate.id === id);
      if (index === -1) return false;
      const application = applications[index];
      if (application.personal || application.botIds.length > 0) {
        const error = new Error('The Feishu application is still in use');
        error.code = 'application_in_use';
        throw error;
      }
      await this.#credentials.unset(application.secretRef);
      applications.splice(index, 1);
      await this.#registry.replace(applications);
      return true;
    });
  }

  async #restoreSecret(secretRef, previous) {
    if (previous?.value) await this.#credentials.set(secretRef, previous.value);
    else await this.#credentials.unset(secretRef);
  }

  #serialize(operation) {
    const result = this.#transition.then(operation, operation);
    this.#transition = result.then(() => undefined, () => undefined);
    return result;
  }
}
