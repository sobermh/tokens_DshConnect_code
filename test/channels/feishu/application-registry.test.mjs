import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  FeishuApplicationRegistry,
  FeishuApplicationService,
  feishuApplicationId,
} from '../../../src/channels/feishu/application-registry.mjs';

class MemoryCredentials {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.unsetCalls = [];
  }

  async resolve(ref) {
    return this.values.has(ref) ? { value: this.values.get(ref), source: 'file' } : undefined;
  }

  async set(ref, value) {
    this.values.set(ref, value);
  }

  async unset(ref) {
    this.unsetCalls.push(ref);
    this.values.delete(ref);
  }
}

async function fixture(values = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-connect-feishu-apps-'));
  const path = join(directory, 'applications.json');
  const registry = await new FeishuApplicationRegistry(path).load();
  const credentials = new MemoryCredentials(values);
  const service = new FeishuApplicationService({ registry, credentials });
  return { path, registry, credentials, service };
}

function bot(overrides = {}) {
  return {
    id: 'bot_primary',
    appId: 'cli_shared_application',
    secretRef: 'DSH_FEISHU_APP_SECRET_PRIMARY',
    domain: 'feishu',
    botName: '飞书机器人',
    ...overrides,
  };
}

test('imports an existing IM application without exposing its credential reference', async () => {
  const config = bot();
  const fx = await fixture({ [config.secretRef]: 'bot-secret' });

  const imported = await fx.service.importBot(config);
  const applications = fx.service.listPublic();

  assert.equal(imported.applicationId, feishuApplicationId(config.appId));
  assert.equal(imported.secretRef, config.secretRef);
  assert.deepEqual(applications, [{
    applicationId: imported.applicationId,
    name: '飞书机器人',
    appIdMasked: 'cli_shar••••tion',
    domain: 'feishu',
    botIds: ['bot_primary'],
    botCount: 1,
    usedByPersonal: false,
  }]);
  assert.equal(JSON.stringify(applications).includes('secretRef'), false);
  assert.equal(JSON.stringify(applications).includes('bot-secret'), false);
  assert.deepEqual(fx.service.findPublicByAppId(config.appId), applications[0]);
  assert.equal(fx.service.findPublicByAppId('cli_missing'), null);
});

test('matching legacy personal credentials merge into the IM application by App ID', async () => {
  const config = bot();
  const fx = await fixture({
    [config.secretRef]: 'shared-secret',
    FEISHU_APP_ID: config.appId,
    FEISHU_APP_SECRET: 'stale-personal-secret',
  });
  const imported = await fx.service.importBot(config);

  const personal = await fx.service.importLegacyPersonal({
    appIdRef: 'FEISHU_APP_ID',
    appSecretRef: 'FEISHU_APP_SECRET',
    domain: 'feishu',
    name: 'Tokens 工作助手',
  });

  assert.equal(personal.applicationId, imported.applicationId);
  assert.equal(personal.botCount, 1);
  assert.equal(personal.usedByPersonal, true);
  assert.equal(fx.service.listPublic().length, 1);
  assert.equal(fx.credentials.values.get(config.secretRef), 'shared-secret');
  assert.equal(fx.credentials.values.has('FEISHU_APP_ID'), false);
  assert.equal(fx.credentials.values.has('FEISHU_APP_SECRET'), false);
});

test('distinct existing IM and personal applications remain separate', async () => {
  const config = bot();
  const fx = await fixture({
    [config.secretRef]: 'bot-secret',
    FEISHU_APP_ID: 'cli_personal_only',
    FEISHU_APP_SECRET: 'personal-secret',
  });
  await fx.service.importBot(config);

  await fx.service.importLegacyPersonal({
    appIdRef: 'FEISHU_APP_ID',
    appSecretRef: 'FEISHU_APP_SECRET',
    domain: 'feishu',
    name: '个人应用',
  });

  const applications = fx.service.listPublic();
  assert.equal(applications.length, 2);
  assert.equal(applications.find((application) => application.botCount === 1)?.usedByPersonal, false);
  assert.equal(applications.find((application) => application.usedByPersonal)?.botCount, 0);
});

test('detaching either consumer preserves the application and shared secret', async () => {
  const config = bot();
  const fx = await fixture({ [config.secretRef]: 'shared-secret' });
  const application = await fx.service.importBot(config);
  await fx.service.selectPersonal(application.applicationId);

  await fx.service.detachBot(config.id);
  assert.equal(fx.service.getPersonalApplication()?.usedByPersonal, true);
  assert.equal(fx.service.getPersonalApplication()?.botCount, 0);
  assert.equal(fx.credentials.values.get(config.secretRef), 'shared-secret');

  await fx.service.attachBot(application.applicationId, config.id);
  await fx.service.detachPersonal();
  assert.equal(fx.service.getPersonalApplication(), null);
  assert.equal(fx.service.listPublic()[0].botCount, 1);
  assert.equal(fx.credentials.values.get(config.secretRef), 'shared-secret');
  assert.deepEqual(fx.credentials.unsetCalls, []);
});

test('startup reconciliation removes stale bot consumers without deleting applications', async () => {
  const config = bot();
  const fx = await fixture({ [config.secretRef]: 'shared-secret' });
  const application = await fx.service.importBot(config);
  await fx.service.attachBot(application.applicationId, 'bot_stale');

  await fx.service.reconcileBotConsumers([config.id]);

  assert.deepEqual(fx.service.listPublic()[0].botIds, [config.id]);
  assert.equal(fx.credentials.values.get(config.secretRef), 'shared-secret');
});

test('registry persists only non-secret application metadata', async () => {
  const fx = await fixture();
  await fx.service.storeApplication({
    appId: 'cli_persisted',
    appSecret: 'never-write-this-secret',
    domain: 'lark',
    name: 'Persisted application',
  });

  const document = await readFile(fx.path, 'utf8');
  assert.match(document, /cli_persisted/);
  assert.doesNotMatch(document, /never-write-this-secret/);
  const reloaded = await new FeishuApplicationRegistry(fx.path).load();
  assert.equal(reloaded.list()[0].domain, 'lark');
});
