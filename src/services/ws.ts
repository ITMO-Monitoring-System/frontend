export type MsgHandler = (msg: any) => void

export class WsService {
  private url: string
  private socket: WebSocket | null = null
  private handlers: MsgHandler[] = []
  private token?: string

  constructor(url: string) {
    this.url = url
  }

  connect(token?: string) {
    this.token = token
    let u = this.url
    if (this.token) {
      const sep = u.includes('?') ? '&' : '?'
      u = `${u}${sep}token=${encodeURIComponent(this.token)}`
    }
    this.socket = new WebSocket(u)
    this.socket.binaryType = 'arraybuffer'
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
        console.error(err)
      }
    }
    this.socket.onopen = () => {
      this.handlers.forEach(h => h({ type: 'open' }))
    }
    this.socket.onclose = (ev) => {
      this.handlers.forEach(h => h({ type: 'close', code: ev.code, reason: ev.reason }))
    }
    this.socket.onerror = (ev) => {
      this.handlers.forEach(h => h({ type: 'error', ev }))
    }
  }

  send(obj: any) {
    if (!this.socket) return
    if (this.socket.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(obj)) } catch (e) { console.error(e) }
    }
  }

  addHandler(h: MsgHandler) { this.handlers.push(h) }
  removeHandler(h: MsgHandler) { this.handlers = this.handlers.filter(x => x !== h) }

  close() {
    try { this.socket?.close() } catch {}
    this.socket = null
    this.handlers = []
  }
}
