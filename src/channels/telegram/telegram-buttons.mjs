import { randomBytes } from 'node:crypto';

export class TelegramButtons {
  #items = new Map();
  #api;
  #signal;

  constructor(api, signal) {
    this.#api = api;
    this.#signal = signal;
  }

  create(target, buttons) {
    if (!buttons?.options?.length || buttons.options.length > 95) return null;
    while (this.#items.size >= 2048) this.#items.delete(this.#items.keys().next().value);
    const id = randomBytes(12).toString('hex');
    const item = { id, target, buttons, selected: new Set(), busy: false, messageId: null };
    this.#items.set(id, item);
    return {
      markup: this.#markup(item),
      attach: (messageId) => { item.messageId = messageId; },
      discard: () => this.#items.delete(id),
    };
  }

  #markup(item) {
    const rows = item.buttons.options.map((option, index) => [{
      text: `${item.selected.has(index) ? '[x] ' : ''}${index + 1}. ${option.label}`.slice(0, 80),
      callback_data: `dsh:${item.id}:${index}`,
    }]);
    if (item.buttons.multiSelect) rows.push([{ text: '提交选择', callback_data: `dsh:${item.id}:done` }]);
    return { inline_keyboard: rows };
  }

  async handle(query, accept, allowed) {
    const match = /^dsh:([a-f0-9]{24}):(\d+|done)$/.exec(query?.data ?? '');
    const item = match && this.#items.get(match[1]);
    const notice = (text) => this.#api.answerCallbackQuery({
      callbackQueryId: query.id, text, signal: this.#signal,
    }).catch(() => undefined);
    if (!item || !item.buttons.isActive()) {
      await notice('该按钮已失效，请查看最新问题。');
      return;
    }
    const message = query.message;
    const inbound = {
      messageId: `callback:${query.id}`, senderId: String(query.from?.id ?? ''),
      senderIsBot: query.from?.is_bot === true,
      kind: item.target.chatType === 'private' ? 'direct' : 'group',
      conversationId: item.target.messageThreadId === undefined
        ? String(item.target.chatId) : `${item.target.chatId}:${item.target.messageThreadId}`,
      addressed: true, plainText: true, replyTarget: item.target,
    };
    if (inbound.senderIsBot || inbound.senderId !== item.buttons.actor
      || String(message?.chat?.id) !== String(item.target.chatId)
      || message?.message_id !== item.messageId || !allowed(inbound)) {
      await notice('只有发起当前任务的用户可以操作。');
      return;
    }
    if (item.busy) { await notice('正在处理，请稍候。'); return; }
    const choice = match[2];
    const index = Number(choice);
    if (choice !== 'done' && !item.buttons.options[index]) { await notice('无效选项。'); return; }
    if (choice === 'done' && (!item.buttons.multiSelect || !item.selected.size)) {
      await notice('请先选择选项。'); return;
    }
    item.busy = true;
    try {
      await notice('已收到');
      if (!item.buttons.isActive()) return;
      if (item.buttons.multiSelect && choice !== 'done') {
        if (item.selected.has(index)) item.selected.delete(index);
        else item.selected.add(index);
        await this.#api.editMessageReplyMarkup({ chatId: item.target.chatId,
          messageId: item.messageId, replyMarkup: this.#markup(item), signal: this.#signal });
        return;
      }
      inbound.content = item.buttons.multiSelect
        ? [...item.selected].sort((a, b) => a - b).map((value) => value + 1).join(',')
        : item.buttons.values?.[index] ?? String(index + 1);
      // The bridge claims the current interaction synchronously before its first await.
      await accept(inbound);
      if (!item.buttons.isActive()) {
        this.#items.delete(item.id);
        await this.#api.editMessageReplyMarkup({ chatId: item.target.chatId,
          messageId: item.messageId, replyMarkup: { inline_keyboard: [] }, signal: this.#signal });
      }
    } finally { item.busy = false; }
  }
}
