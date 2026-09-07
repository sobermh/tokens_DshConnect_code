const SKILL_CAPABILITIES = Object.freeze({
  'dingtalk-aisearch': '智能搜索',
  'dingtalk-aitable': 'AI 表格',
  'dingtalk-calendar': '日历与会议',
  'dingtalk-chat': '群聊与消息',
  'dingtalk-contact': '通讯录',
  'dingtalk-doc': '在线文档',
  'dingtalk-drive': '钉盘文件',
  'dingtalk-event': '事件订阅',
  'dingtalk-mail': '钉钉邮箱',
  'dingtalk-minutes': 'AI 听记',
  'dingtalk-misc': '审批、考勤与其他业务',
  'dingtalk-shared': '公共运行规则',
  'dingtalk-todo': '待办任务',
  'dingtalk-wiki': '知识库',
});

export function buildDingtalkCapabilities(skills) {
  const names = Array.isArray(skills?.names) ? skills.names : [];
  return names
    .filter((name) => Object.hasOwn(SKILL_CAPABILITIES, name))
    .map((name) => ({ id: name, label: SKILL_CAPABILITIES[name] }));
}
