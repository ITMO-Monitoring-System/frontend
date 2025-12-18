type MsgHandler = (msg: any) => void;

export class WsService {
  private url: string;
  private socket: WebSocket | null = null;
  private handlers: MsgHandler[] = [];
  private token?: string;
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  // Публичные колбэки для статуса WS
  public onOpen?: () => void;
  public onClose?: () => void;
  public onError?: () => void;

  constructor(url: string) {
    this.url = url;
  }

  connect(token?: string) {
    this.token = token;
    this.shouldReconnect = true;
    this._open();
  }

  private _open() {
    const urlWithToken = this.token
      ? `${this.url}?token=${encodeURIComponent(this.token)}`
      : this.url;

    this.socket = new WebSocket(urlWithToken);
    this.socket.binaryType = 'arraybuffer';

    this.socket.onopen = () => {
      console.log('[WS] open');
      this.reconnectAttempts = 0;
      this.onOpen?.();
    };

    this.socket.onmessage = (e) => {
      try {
        if (typeof e.data === 'string') {
          try {
            const json = JSON.parse(e.data);
            this.handlers.forEach((h) => h(json));
          } catch {
            this.handlers.forEach((h) => h({ type: 'log', text: e.data }));
          }
          return;
        }

        if (e.data instanceof ArrayBuffer) {
          try {
            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(new Uint8Array(e.data));
            const json = JSON.parse(text);
            this.handlers.forEach((h) => h(json));
            return;
          } catch (_) {
            const blob = new Blob([e.data], { type: 'image/jpeg' });
            this.handlers.forEach((h) => h({ type: 'binary', blob }));
            return;
          }
        }

        if (e.data instanceof Blob) {
          this.handlers.forEach((h) => h({ type: 'binary', blob: e.data }));
          return;
        }

        this.handlers.forEach((h) => h({ type: 'unknown', data: e.data }));
      } catch (err) {
        console.error('[WS] onmessage error', err);
      }
    };

    this.socket.onclose = (ev) => {
      console.log('[WS] closed', ev.code, ev.reason);
      this.onClose?.();
      if (this.shouldReconnect) {
        this.reconnectAttempts++;
        const timeout = Math.min(
          30000,
          1000 * Math.pow(1.5, this.reconnectAttempts)
        );
        setTimeout(() => this._open(), timeout);
      }
    };

    this.socket.onerror = (e) => {
      console.error('[WS] error', e);
      this.onError?.();
    };
  }

  send(obj: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(obj));
      } catch (err) {
        console.error('[WS] send error', err);
      }
    } else {
      console.warn('[WS] not open, cannot send');
    }
  }

  addHandler(h: MsgHandler) {
    this.handlers.push(h);
  }

  removeHandler(h: MsgHandler) {
    this.handlers = this.handlers.filter((x) => x !== h);
  }

  close() {
    this.shouldReconnect = false;
    this.socket?.close();
  }
}
