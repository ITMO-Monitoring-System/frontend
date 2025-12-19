type MsgHandler = (msg: any) => void

export class WsService {
  private url: string
  private socket: WebSocket | null = null
  private handlers: MsgHandler[] = []
  private token?: string
  private reconnectAttempts = 0
  private shouldReconnect = true

  private _mockInterval?: number
  private _mockCounter = 0
  private _isMock = false

  private _realConnectTimeout?: number
  private _realOpened = false

  constructor(url: string) {
    this.url = url
  }

  connect(token?: string) {
    this.token = token
    this.shouldReconnect = true
    this._isMock = false
    this._realOpened = false
    this._openReal()
  }

  private _openReal() {
    let urlWithToken = this.url
    if (this.token) {
      const sep = this.url.includes('?') ? '&' : '?'
      urlWithToken = `${this.url}${sep}token=${encodeURIComponent(this.token)}`
    }

    try {
      this.socket = new WebSocket(urlWithToken)
      this.socket.binaryType = 'arraybuffer'
    } catch (err) {
      console.error('[WS] failed to create WebSocket', err)
      this._maybeFallbackToMock('constructor-failed')
      return
    }

    const REAL_OPEN_TIMEOUT = 5000
    this._realConnectTimeout = window.setTimeout(() => {
      if (!this._realOpened) {
        console.warn('[WS] real open timeout, will fallback to mock if allowed')
        this._maybeFallbackToMock('open-timeout')
      }
    }, REAL_OPEN_TIMEOUT) as unknown as number

    this.socket.onopen = () => {
      this._realOpened = true
      if (this._realConnectTimeout) {
        clearTimeout(this._realConnectTimeout)
        this._realConnectTimeout = undefined
      }
      console.log('[WS] real socket open', urlWithToken)
      this.reconnectAttempts = 0
    }

    this.socket.onmessage = (e) => {
      try {
        if (typeof e.data === 'string') {
          try {
            const json = JSON.parse(e.data)
            this.handlers.forEach(h => h(json))
          } catch {
            this.handlers.forEach(h => h({ type: 'log', text: e.data }))
          }
          return
        }

        if (e.data instanceof ArrayBuffer) {
          try {
            const decoder = new TextDecoder('utf-8')
            const text = decoder.decode(new Uint8Array(e.data))
            const json = JSON.parse(text)
            this.handlers.forEach(h => h(json))
            return
          } catch (_) {
          }
          const blob = new Blob([e.data], { type: 'image/jpeg' })
          this.handlers.forEach(h => h({ type: 'binary', blob }))
          return
        }

        if (e.data instanceof Blob) {
          this.handlers.forEach(h => h({ type: 'binary', blob: e.data }))
          return
        }

        this.handlers.forEach(h => h({ type: 'unknown', data: e.data }))
      } catch (err) {
        console.error('[WS] onmessage error', err)
      }
    }

    this.socket.onclose = (ev) => {
      console.log('[WS] real closed', ev.code, ev.reason)
      if (!this._realOpened) {
        this._maybeFallbackToMock('closed-before-open')
        return
      }
      if (this.shouldReconnect) {
        this.reconnectAttempts++
        const timeout = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempts))
        setTimeout(() => this._openReal(), timeout)
      }
    }

    this.socket.onerror = (e) => {
      console.error('[WS] real error', e)
      if (!this._realOpened) {
        this._maybeFallbackToMock('error-before-open')
      }
    }
  }

  private _maybeFallbackToMock(reason: string) {
    if (this._isMock) return

    if (this.socket) {
      try { this.socket.close() } catch {}
      this.socket = null
    }

    if (this._realConnectTimeout) {
      clearTimeout(this._realConnectTimeout)
      this._realConnectTimeout = undefined
    }

    if (this.token === 'admin-token') {
      console.warn('[WS] falling back to mock because:', reason)
      this._startMock()
    } else {
      console.warn('[WS] real ws failed and no mock allowed (not admin-token); will keep retrying real WS')
      if (this.shouldReconnect) {
        this.reconnectAttempts++
        const timeout = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempts))
        setTimeout(() => this._openReal(), timeout)
      }
    }
  }

  private _startMock() {
    this._isMock = true
    this._mockCounter = 0
    if (this._mockInterval) clearInterval(this._mockInterval)
    this._mockInterval = window.setInterval(() => {
      this._mockCounter++
      const names = ['Иванов И.', 'Петров П.', 'Сидоров С.', 'Мария К.']
      const detected = [
        {
          id: `${(this._mockCounter % names.length) + 1}`,
          name: names[this._mockCounter % names.length],
          bbox: [Math.random() * 0.6, Math.random() * 0.6, 0.2, 0.2],
          score: 0.8 + Math.random() * 0.2
        }
      ]
      this.handlers.forEach(h => h({ type: 'detections', detections: detected }))

      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'><rect width='100%' height='100%' fill='rgb(${120 + (this._mockCounter*10)%120},90,150)' /></svg>`
      const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
      this.handlers.forEach(h => h({ type: 'frame', imageBase64: dataUrl }))
    }, 900)
    console.log('[WS mock] started')
  }

  send(obj: any) {
    if (this._isMock) {
      // we can simulate ack or ignore. For now, just log.
      console.log('[WS mock] send', obj)
      return
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(obj)) } catch (err) { console.error('WS send error', err) }
    } else {
      console.warn('[WS] not open, cannot send')
    }
  }

  addHandler(h: MsgHandler) { this.handlers.push(h) }
  removeHandler(h: MsgHandler) { this.handlers = this.handlers.filter(x => x !== h) }

  close() {
    this.shouldReconnect = false
    // stop mock
    if (this._mockInterval) {
      clearInterval(this._mockInterval)
      this._mockInterval = undefined
      this._isMock = false
    }
    if (this.socket) {
      try { this.socket.close() } catch {}
      this.socket = null
    }
    if (this._realConnectTimeout) {
      clearTimeout(this._realConnectTimeout)
      this._realConnectTimeout = undefined
    }
  }
}
