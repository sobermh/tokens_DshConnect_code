function unavailableQrConnect() {
  const error = new Error('QQ QR provisioning is unavailable; bind the bot with AppID and AppSecret.');
  error.code = 'qq-qr-unavailable';
  throw error;
}

export class QqQrAuth {
  #start;
  #source;

  constructor({ start = unavailableQrConnect, source = 'deepseek-harness' } = {}) {
    if (typeof start !== 'function') throw new TypeError('QQ QR connector is required');
    this.#start = start;
    this.#source = source;
  }

  start(callbacks, { signal } = {}) {
    if (!callbacks || typeof callbacks.onSuccess !== 'function'
      || typeof callbacks.onFailure !== 'function') {
      throw new TypeError('QQ QR callbacks are required');
    }
    return this.#start(callbacks, {
      displayQrCodeToConsole: false,
      source: this.#source,
      signal,
    });
  }
}
