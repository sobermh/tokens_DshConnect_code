import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';

import {
  apply as applyClient,
  IMSettingsTab,
  inject as clientInject,
} from '../plugin-src/client/index.js';
import { CredentialBindingPanel } from '../plugin-src/client/credential-binding.js';
import { ChannelListHeading } from '../plugin-src/client/channel-card-meta.js';
import { DINGTALK_ENDPOINTS } from '../plugin-src/client/channels/dingtalk/api.js';
import {
  AccountCard as DingtalkAccountCard,
  DingtalkSettingsTab,
} from '../plugin-src/client/channels/dingtalk/index.js';
import {
  BotCard as FeishuBotCard,
  FeishuSettingsTab,
} from '../plugin-src/client/channels/feishu/index.js';
import { FEISHU_ENDPOINTS } from '../plugin-src/client/channels/feishu/api.js';
import {
  AccountCard as WeixinAccountCard,
  WeixinSettingsTab,
} from '../plugin-src/client/channels/weixin/index.js';
import {
  AccountCard as WecomAccountCard,
  WecomSettingsTab,
} from '../plugin-src/client/channels/wecom/index.js';
import {
  AccountCard as QqAccountCard,
  QqSettingsTab,
} from '../plugin-src/client/channels/qq/index.js';
import {
  SlackAccountCard,
  SlackSettingsTab,
} from '../plugin-src/client/channels/slack/index.js';
import {
  TelegramAccountCard,
  TelegramSettingsTab,
} from '../plugin-src/client/channels/telegram/index.js';
import {
  DiscordAccountCard,
  DiscordSettingsTab,
} from '../plugin-src/client/channels/discord/index.js';
import {
  WhatsappAccountCard,
  WhatsappSettingsTab,
} from '../plugin-src/client/channels/whatsapp/index.js';
import {
  IMessageAccountCard,
  IMessageSettingsTab,
} from '../plugin-src/client/channels/imessage/index.js';
import {
  en,
  IM_LOCALE_NAMESPACE,
  localizeText,
  setImTranslator,
  zh,
} from '../plugin-src/client/i18n.js';
import {
  CONNECTION_CENTER_NAV_ATTRIBUTE,
  installConnectionCenterNavIcon,
  markConnectionCenterNav,
} from '../plugin-src/client/settings-nav-icon.js';

const STYLES_URL = new URL('../plugin-src/client/styles.js', import.meta.url);
const FEISHU_STYLES_URL = new URL(
  '../plugin-src/client/channels/feishu/styles.js',
  import.meta.url,
);
const WEIXIN_STYLES_URL = new URL(
  '../plugin-src/client/channels/weixin/styles.js',
  import.meta.url,
);
const DINGTALK_STYLES_URL = new URL(
  '../plugin-src/client/channels/dingtalk/styles.js',
  import.meta.url,
);
const WECOM_STYLES_URL = new URL(
  '../plugin-src/client/channels/wecom/styles.js',
  import.meta.url,
);
const FEISHU_SOURCE_URL = new URL(
  '../plugin-src/client/channels/feishu/index.js',
  import.meta.url,
);
const WEIXIN_SOURCE_URL = new URL(
  '../plugin-src/client/channels/weixin/index.js',
  import.meta.url,
);
const CLIENT_BUNDLE_URL = new URL('../lib/client.js', import.meta.url);
const CLIENT_SOURCE_DIRECTORY_URL = new URL('../plugin-src/client/', import.meta.url);
const DINGTALK_CLIENT_SOURCE_URL = new URL(
  '../plugin-src/client/channels/dingtalk/index.js',
  import.meta.url,
);
const WECOM_SOURCE_URL = new URL(
  '../plugin-src/client/channels/wecom/index.js',
  import.meta.url,
);
const QQ_SOURCE_URL = new URL(
  '../plugin-src/client/channels/qq/index.js',
  import.meta.url,
);

test('connection center separates IM bots and app authorization', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');
  const markup = renderToStaticMarkup(React.createElement(IMSettingsTab, {
    feishuRpcCall: async () => ({ ok: true, value: {} }),
    weixinRpcCall: async () => ({ ok: true, value: {} }),
    dingtalkRpcCall: async () => ({ ok: true, value: {} }),
    wecomRpcCall: async () => ({ ok: true, value: {} }),
    qqRpcCall: async () => ({ ok: true, value: {} }),
    slackRpcCall: async () => ({ ok: true, value: {} }),
    telegramRpcCall: async () => ({ ok: true, value: {} }),
    discordRpcCall: async () => ({ ok: true, value: {} }),
    whatsappRpcCall: async () => ({ ok: true, value: {} }),
    imessageRpcCall: async () => ({ ok: true, value: {} }),
    feishuPersonalRpcCall: async () => ({ ok: true, value: {} }),
    dingtalkPersonalRpcCall: async () => ({ ok: true, value: {} }),
  }));

  assert.match(markup, /连接中心/);
  assert.match(markup, /统一管理 IM 机器人与应用授权/);
  assert.match(markup, /class="dim-brand"/);
  assert.match(markup, /<strong class="dim-brandName">连接中心<\/strong>/);
  assert.doesNotMatch(markup, /dim-brandLogo|<img/);
  assert.match(markup, /href="https:\/\/github\.com\/sobermh\/tokens_DshConnect_code"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /aria-label="连接中心 GitHub"/);
  assert.match(markup, /aria-describedby="[^"]+"/);
  assert.match(markup, /role="tooltip"[^>]*>帮助与反馈 · 前往 GitHub</);
  assert.match(styles, /\.dim-title \{[^}]*margin: 0;/);
  assert.match(styles, /\.dim-title p \{[^}]*color: var\(--dsw-alias-label-tertiary, #8f959e\);[^}]*font-size: 13px;[^}]*font-weight: 400;/);
  assert.match(styles, /\.dim-brand \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*align-items: flex-start;[^}]*gap: 1px;/);
  assert.match(styles, /\.dim-brandName \{[^}]*font-size: 18px;[^}]*font-weight: 600;[^}]*letter-spacing: 0;/);
  assert.doesNotMatch(styles, /\.dim-brandLogo/);
  assert.match(styles, /\.dim-githubLink \{[^}]*border: 1px solid var\(--dsw-alias-border-l2, #dfe1e5\);[^}]*text-decoration: none;/);
  assert.match(styles, /\.dim-githubTooltip \{[^}]*top: calc\(100% \+ 8px\);[^}]*transform: translateY\(-3px\);/);
  assert.match(styles, /\.dim-githubAction:hover \.dim-githubTooltip, \.dim-githubAction:focus-within \.dim-githubTooltip \{[^}]*opacity: 1;[^}]*visibility: visible;/);
  assert.doesNotMatch(markup, /\d+ 个渠道|dim-channelCount/);
  assert.match(markup, /class="dim-modeTabs"[^>]*aria-label="连接类型"/);
  assert.match(markup, /<button[^>]*role="tab"[^>]*class="dim-modeTab"[^>]*aria-label="IM机器人"[^>]*aria-selected="true"[^>]*data-active="true"/);
  assert.match(markup, /<button[^>]*role="tab"[^>]*class="dim-modeTab"[^>]*aria-label="应用授权"[^>]*aria-selected="false"/);
  assert.doesNotMatch(markup, /服务连接/);
  assert.match(markup, /AI Office/);
  assert.match(markup, />微信</);
  assert.match(markup, />飞书</);
  assert.doesNotMatch(markup, />飞书个人账号</);
  assert.match(markup, />钉钉</);
  assert.match(markup, />企业微信</);
  assert.match(markup, />QQ</);
  assert.match(markup, />Slack</);
  assert.match(markup, />Telegram</);
  assert.match(markup, />Discord</);
  assert.match(markup, />WhatsApp</);
  assert.match(markup, />iMessage</);
  assert.match(markup, /dim-logoWeixin/);
  assert.match(markup, /dim-logoFeishu/);
  assert.match(markup, /dim-logoDingtalk/);
  assert.match(markup, /dim-logoWecom/);
  assert.match(markup, /dim-logoQq/);
  assert.match(markup, /dim-logoSlack/);
  assert.match(markup, /dim-logoTelegram/);
  assert.match(markup, /dim-logoDiscord/);
  assert.match(markup, /dim-logoWhatsapp/);
  assert.match(markup, /dim-logoIMessage/);
  assert.match(styles, /\.dim-logoFeishu svg \{ width: 28px; height: 28px; \}/);
  assert.match(styles, /\.dim-modeTabs \{[^}]*display: flex;[^}]*margin-top: 14px;[^}]*border-bottom: 1px solid/);
  assert.match(styles, /\.dim-modeTab \{[^}]*position: relative;[^}]*border: 0;[^}]*background: transparent;/);
  assert.match(styles, /\.dim-modeTab\[data-active="true"\]::after[^}]*height: 2px;[^}]*background: var\(--dsw-alias-label-primary, #1f2329\);/);
  assert.match(styles, /\.dim-rail \{[^}]*display: grid;[^}]*align-content: start;[^}]*gap: 7px;/);
  assert.match(styles, /\.dim-channel \{[^}]*min-height: 44px;[^}]*border-radius: 8px;/);
  assert.equal((markup.match(/role="tab"/g) ?? []).length, 14);
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /role="switch"|type="checkbox"/);
  assert.doesNotMatch(markup, /dim-chevron|扫码绑定<\/small>|扫码接入<\/small>/);
  assert.doesNotMatch(markup, />INSTANT MESSAGING<|>Channel<|>微信设置</);
});

test('connection center category switch reveals app authorization without a long rail', async () => {
  const rpcCall = async () => ({ ok: true, value: {} });
  let personalStatusCalls = 0;
  const feishuPersonalRpcCall = async (endpoint) => {
    if (endpoint === 'feishu/status') personalStatusCalls += 1;
    return {
      ok: true,
      value: {
        phase: 'connected',
        userAuthorized: true,
        userName: 'Sean',
        applications: [],
      },
    };
  };
  let renderer;

  await act(async () => {
    renderer = create(React.createElement(IMSettingsTab, {
      feishuRpcCall: rpcCall,
      weixinRpcCall: rpcCall,
      dingtalkRpcCall: rpcCall,
      wecomRpcCall: rpcCall,
      qqRpcCall: rpcCall,
      slackRpcCall: rpcCall,
      telegramRpcCall: rpcCall,
      discordRpcCall: rpcCall,
      whatsappRpcCall: rpcCall,
      imessageRpcCall: rpcCall,
      feishuPersonalRpcCall,
      dingtalkPersonalRpcCall: rpcCall,
    }));
  });

  assert.equal(personalStatusCalls, 1, 'app authorization status is prefetched before category switch');

  const channelLabels = () => renderer.root
    .findAll((node) => node.type === 'button' && node.props.className === 'dim-channel')
    .map((node) => node.findByType('strong').children.join(''));

  assert.deepEqual(channelLabels(), [
    '微信',
    '飞书',
    '钉钉',
    '企业微信',
    'QQ',
    'Slack',
    'Telegram',
    'Discord',
    'WhatsApp',
    '企业微信应用',
    'iMessage',
    'AI Office',
  ]);

  await act(async () => {
    renderer.root
      .findAll((node) => node.type === 'button' && node.props.className === 'dim-modeTab')
      .find((node) => node.props['aria-label'] === '应用授权')
      .props.onClick();
  });

  assert.deepEqual(channelLabels(), ['飞书个人账号', '钉钉个人账号']);
  const modeTabs = renderer.root
    .findAll((node) => node.type === 'button' && node.props.className === 'dim-modeTab');
  assert.equal(modeTabs.find((node) => node.props['aria-label'] === '应用授权').props['aria-selected'], true);
  assert.equal(modeTabs.find((node) => node.props['aria-label'] === 'IM机器人').props['aria-selected'], false);
  assert.equal(renderer.root.findByProps({ className: 'dfp-badge' }).children.join(''), '已连接');

  await act(async () => renderer.unmount());
});

test('connection center marks its settings navigation entry with a dedicated network icon hook', () => {
  function button(label) {
    const attributes = new Map();
    return {
      attributes,
      querySelectorAll: () => [{ textContent: label }],
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
    };
  }

  const connectionCenter = button('连接中心');
  const plugins = button('插件');
  const root = {
    body: {},
    querySelectorAll(selector) {
      if (selector === 'nav button') return [connectionCenter, plugins];
      if (selector === `[${CONNECTION_CENTER_NAV_ATTRIBUTE}]`) {
        return [connectionCenter, plugins].filter((entry) =>
          entry.attributes.has(CONNECTION_CENTER_NAV_ATTRIBUTE));
      }
      return [];
    },
  };
  let observerDisconnected = false;
  let observed;
  class Observer {
    constructor(callback) {
      this.callback = callback;
    }

    observe(target, options) {
      observed = { target, options };
    }

    disconnect() {
      observerDisconnected = true;
    }
  }

  assert.deepEqual(markConnectionCenterNav(root), [connectionCenter]);
  assert.equal(connectionCenter.attributes.get(CONNECTION_CENTER_NAV_ATTRIBUTE), 'true');
  assert.equal(plugins.attributes.has(CONNECTION_CENTER_NAV_ATTRIBUTE), false);

  const dispose = installConnectionCenterNavIcon(root, Observer);
  assert.deepEqual(observed, {
    target: root.body,
    options: { childList: true, subtree: true, characterData: true },
  });
  dispose();
  assert.equal(observerDisconnected, true);
  assert.equal(connectionCenter.attributes.has(CONNECTION_CENTER_NAV_ATTRIBUTE), false);
});

test('Feishu creates a reusable app while connecting only the IM bot', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame(callback) { callback(Date.now()); return 1; },
    cancelAnimationFrame() {},
  };
  let renderer;
  try {
    const rpcCall = async (endpoint) => {
      if (endpoint === FEISHU_ENDPOINTS.status) {
        return { ok: true, value: { schemaVersion: 2, revision: 1, bots: [], applications: [] } };
      }
      if (endpoint === FEISHU_ENDPOINTS.beginProvisioning) {
        return {
          ok: true,
          value: {
            attemptId: 'attempt-create-shared-app',
            verificationUrl: 'https://accounts.feishu.cn/open-apis/authen/v1/index',
            expireIn: 300,
          },
        };
      }
      throw new Error(`Unexpected Feishu endpoint: ${endpoint}`);
    };

    await act(async () => {
      renderer = create(React.createElement(FeishuSettingsTab, { rpcCall }));
      await new Promise((resolve) => setImmediate(resolve));
    });

    const textOf = (node) => node.children
      .map((child) => typeof child === 'string' ? child : textOf(child))
      .join('');
    const headingButton = renderer.root.findAllByType('button')
      .find((node) => node.props.className?.includes('bxf-newApplicationButton'));
    assert.equal(headingButton.props['data-kind'], 'primary');
    assert.equal(textOf(headingButton), '创建应用并接入');
    assert.equal(textOf(renderer.root.findByType('h3')), '创建飞书应用并接入机器人');
    assert.match(JSON.stringify(renderer.toJSON()), /新应用可同时用于 IM 机器人与个人授权/);

    await act(async () => {
      headingButton.props.onClick();
      await new Promise((resolve) => setImmediate(resolve));
    });

    const qrText = JSON.stringify(renderer.toJSON());
    assert.match(qrText, /使用飞书扫码创建应用并接入机器人/);
    assert.match(qrText, /可供 IM 机器人与个人授权共用的飞书自建应用/);
    assert.match(qrText, /不会自动授权个人账号/);
    assert.match(qrText, /个人授权可稍后在“应用授权”中复用此应用/);
    assert.match(qrText, /已接入的机器人不会受到影响/);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('Feishu prioritizes an existing reusable application over creating another one', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame(callback) { callback(Date.now()); return 1; },
    cancelAnimationFrame() {},
  };
  let renderer;
  try {
    const rpcCall = async (endpoint) => {
      assert.equal(endpoint, FEISHU_ENDPOINTS.status);
      return {
        ok: true,
        value: {
          schemaVersion: 2,
          revision: 1,
          bots: [],
          applications: [{
            applicationId: 'application-shared',
            name: '共享飞书应用',
            appIdMasked: 'cli_1234••••5678',
            botIds: [],
            usedByPersonal: true,
          }],
        },
      };
    };

    await act(async () => {
      renderer = create(React.createElement(FeishuSettingsTab, { rpcCall }));
      await new Promise((resolve) => setImmediate(resolve));
    });
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });

    const textOf = (node) => node.children
      .map((child) => typeof child === 'string' ? child : textOf(child))
      .join('');
    const buttons = renderer.root.findAllByType('button');
    const newApplicationButton = buttons
      .find((node) => node.props.className?.includes('bxf-newApplicationButton'));
    const reuseButton = buttons.find((node) => textOf(node) === '接入机器人');
    const applicationSelect = renderer.root.findByType('select');

    assert.equal(newApplicationButton.props['data-kind'], 'secondary');
    assert.equal(newApplicationButton.props['aria-label'], '新建独立飞书应用并接入机器人');
    assert.equal(textOf(newApplicationButton), '新建独立应用');
    assert.equal(reuseButton.props['data-kind'], 'primary');
    assert.equal(applicationSelect.props.value, 'application-shared');
    assert.match(JSON.stringify(renderer.toJSON()), /使用已有飞书应用/);
    assert.match(JSON.stringify(renderer.toJSON()), /个人授权共用/);
    assert.equal(renderer.root.findAllByType('h3').length, 0);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('every shipped Chinese client string has an English projection', async () => {
  const paths = (await readdir(CLIENT_SOURCE_DIRECTORY_URL, { recursive: true }))
    .filter((path) => path.endsWith('.js') && path !== 'i18n.js');
  const sources = await Promise.all(paths.map((path) =>
    readFile(new URL(path, CLIENT_SOURCE_DIRECTORY_URL), 'utf8')));
  const strings = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      if (/[\p{Script=Han}]/u.test(match[2])) strings.add(match[2]);
    }
  }

  setImTranslator((key) => en[key] ?? key);
  try {
    const untranslated = [...strings].filter((value) =>
      /[\p{Script=Han}]/u.test(localizeText(value)));
    assert.deepEqual(untranslated, []);
    assert.ok(strings.size > 350);
  } finally {
    setImTranslator(null);
  }
});

test('client registers a live bilingual locale seat and directory picker for the connection center', async () => {
  const effects = [];
  const registrations = [];
  const dictionaries = [];
  const directoryCalls = [];
  const rpcCall = async () => ({ ok: true, value: {} });
  const ctx = {
    effect(install, label) {
      effects.push({ install, label });
    },
    locale: {
      bind(namespace) {
        assert.equal(namespace, IM_LOCALE_NAMESPACE);
        return (key) => en[key] ?? key;
      },
      register(namespace, value) {
        dictionaries.push({ namespace, value });
        return () => {};
      },
    },
    connection: { rpc: { call: rpcCall } },
    workspaces: {
      async listDirectory(path, signal) {
        directoryCalls.push({ operation: 'list', path, signal });
        return { path, entries: [] };
      },
      async pickDirectory() {
        directoryCalls.push({ operation: 'pick' });
        return '/workspace/chosen';
      },
    },
    slots: {
      inject(name, install) {
        assert.equal(name, 'settings.section');
        install();
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };

  try {
    applyClient(ctx);
    const dictionaryEffect = effects.find((entry) => entry.label === 'im-settings: bilingual dictionaries');
    assert.ok(dictionaryEffect);
    dictionaryEffect.install();

    assert.deepEqual(clientInject, ['slots', 'connection', 'locale', 'workspaces']);
    assert.equal(dictionaries[0].namespace, IM_LOCALE_NAMESPACE);
    assert.deepEqual(Object.keys(dictionaries[0].value.en).sort(), Object.keys(dictionaries[0].value.zh).sort());
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].options.name, 'settings.section');
    assert.equal(registrations[0].options.id, 'connect');
    assert.equal(registrations[0].options.order, 20);
    assert.equal(registrations[0].options.locale, IM_LOCALE_NAMESPACE);
    assert.equal(registrations[0].options.label(), 'Connection center');

    const injected = registrations[0].options.inject();
    const signal = new AbortController().signal;
    assert.deepEqual(
      await injected.workspaceDirectoryPicker.listDirectory('/workspace/current', signal),
      { path: '/workspace/current', entries: [] },
    );
    assert.equal(await injected.workspaceDirectoryPicker.pickDirectory(), '/workspace/chosen');
    assert.deepEqual(directoryCalls, [
      { operation: 'list', path: '/workspace/current', signal },
      { operation: 'pick' },
    ]);

    const markup = renderToStaticMarkup(React.createElement(
      registrations[0].component,
      injected,
    ));
    assert.match(markup, /Manage IM bots and app authorization/);
    assert.match(markup, /Help &amp; feedback · Open GitHub/);
    assert.match(markup, />WeChat<|>Feishu bot<|>DingTalk<|>WeCom</);
    assert.match(markup, />App authorization<\/button>/);
    assert.doesNotMatch(markup, />Personal Feishu account</);
    assert.match(markup, />QQ<[^]*>Slack<[^]*>Telegram<[^]*>Discord<[^]*>WhatsApp</);
    assert.match(markup, /AI Office/);
    assert.doesNotMatch(markup, /[\p{Script=Han}]/u);
  } finally {
    setImTranslator(null);
  }
});
