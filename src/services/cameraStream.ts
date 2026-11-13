export type CameraStreamState = 'idle' | 'connecting' | 'sending' | 'error'

export const CAMERA_STREAM_CONNECT_TIMEOUT_MS = 10_000

type StreamOptions = {
  prepare: () => Promise<void>
  getUrl: () => string
  capture: (socket: WebSocket, signal: AbortSignal) => Promise<void>
  onMessage: (event: MessageEvent) => void
  onStateChange: (state: CameraStreamState) => void
  onError: (message: string) => void
  createSocket?: (url: string) => WebSocket
  connectTimeoutMs?: number
}

type StreamSession = {
  socket: WebSocket | null
  abort: AbortController
  interval: ReturnType<typeof setInterval> | null
  capturing: boolean
  detach: () => void
  serverError: string
}

const cancelled = () => new DOMException('Подключение видеопотока отменено', 'AbortError')

export const isCameraStreamCancelled = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError'

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(cancelled())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function describeClose(event: CloseEvent, serverError: string): string {
  const detail = event.reason || (event.code === 1008 ? serverError : '')
  return `Видеосоединение закрыто сервером (код ${event.code})${detail ? `: ${detail}` : ''}`
}

function serverErrorFromMessage(event: MessageEvent): string {
  if (typeof event.data !== 'string') return ''
  try {
    const data = JSON.parse(event.data)
    if (data?.type !== 'error' || typeof data.error !== 'string') return ''
    if (data.error === 'lecture_not_started') return 'Лекция не запущена в сервисе обработки кадров'
    if (data.error === 'lecture_id_required') return 'Не указан номер лекции'
    return data.error
  } catch {
    return ''
  }
}

// Socket ownership, pending starts and capture timers share one cancellable session.
// In particular, an old close/encode callback cannot affect a subsequent start.
export class CameraStream {
  private options: StreamOptions
  private session: StreamSession | null = null
  private pending: Promise<void> | null = null
  private state: CameraStreamState = 'idle'
  private fps = 5

  constructor(options: StreamOptions) {
    this.options = options
  }

  isRunning(): boolean {
    return this.state === 'sending'
  }

  setFps(fps: number): void {
    const next = Math.max(1, Math.min(15, Math.round(fps)))
    if (next === this.fps) return
    this.fps = next
    if (this.session && this.isRunning()) this.schedule(this.session)
  }

  start(): Promise<void> {
    if (this.pending) return this.pending
    if (this.isRunning()) return Promise.resolve()

    const session: StreamSession = {
      socket: null,
      abort: new AbortController(),
      interval: null,
      capturing: false,
      detach: () => {},
      serverError: '',
    }
    this.session = session
    this.setState('connecting')
    const pending = Promise.resolve().then(() => this.open(session))
    this.pending = pending
    const clearPending = () => {
      if (this.pending === pending) this.pending = null
    }
    void pending.then(clearPending, clearPending)
    return pending
  }

  stop(): void {
    const session = this.session
    this.session = null
    this.pending = null
    if (session) this.release(session)
    this.setState('idle')
  }

  private setState(state: CameraStreamState): void {
    if (state === this.state) return
    this.state = state
    this.options.onStateChange(state)
  }

  private assertCurrent(session: StreamSession): void {
    if (this.session !== session || session.abort.signal.aborted) throw cancelled()
  }

  private async open(session: StreamSession): Promise<void> {
    try {
      this.assertCurrent(session)
      await withAbort(Promise.resolve().then(() => {
        this.assertCurrent(session)
        return this.options.prepare()
      }), session.abort.signal)
      this.assertCurrent(session)

      const socket = (this.options.createSocket ?? (url => new WebSocket(url)))(this.options.getUrl())
      session.socket = socket
      socket.binaryType = 'arraybuffer'
      const onMessage = (event: MessageEvent) => {
        if (this.session !== session) return
        session.serverError = serverErrorFromMessage(event) || session.serverError
        this.options.onMessage(event)
      }
      const onClose = (event: CloseEvent) => {
        if (this.isRunning()) this.fail(session, new Error(describeClose(event, session.serverError)))
      }
      const onError = () => {
        if (this.isRunning()) this.fail(session, new Error('Ошибка WebSocket видеопотока'))
      }
      socket.addEventListener('message', onMessage)
      socket.addEventListener('close', onClose)
      socket.addEventListener('error', onError)
      session.detach = () => {
        socket.removeEventListener('message', onMessage)
        socket.removeEventListener('close', onClose)
        socket.removeEventListener('error', onError)
      }

      await this.waitForOpen(session, socket)
      this.assertCurrent(session)
      this.setState('sending')
      this.schedule(session, true)
    } catch (error) {
      if (this.session === session) this.fail(session, error)
      throw error
    }
  }

  private waitForOpen(session: StreamSession, socket: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const signal = session.abort.signal
      const timeoutMs = this.options.connectTimeoutMs ?? CAMERA_STREAM_CONNECT_TIMEOUT_MS
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        socket.removeEventListener('open', onOpen)
        socket.removeEventListener('error', onError)
        socket.removeEventListener('close', onClose)
        signal.removeEventListener('abort', onAbort)
        if (error) reject(error)
        else resolve()
      }
      const onOpen = () => finish()
      const onError = () => finish(new Error('Не удалось открыть WebSocket видеопотока: ошибка соединения'))
      const onClose = (event: CloseEvent) => finish(new Error(describeClose(event, session.serverError)))
      const onAbort = () => finish(cancelled())
      const timeout = setTimeout(() => finish(new Error(
        `Сервер не открыл видеосоединение за ${timeoutMs / 1000} секунд`,
      )), timeoutMs)
      socket.addEventListener('open', onOpen)
      socket.addEventListener('error', onError)
      socket.addEventListener('close', onClose)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
      else if (socket.readyState === 1) onOpen()
      else if (socket.readyState !== 0) finish(new Error('Видеосоединение закрыто до начала отправки'))
    })
  }

  private schedule(session: StreamSession, immediately = false): void {
    if (session.interval !== null) clearInterval(session.interval)
    const tick = () => {
      if (this.session !== session || session.capturing || !this.isRunning()) return
      const socket = session.socket
      if (!socket || socket.readyState !== 1) return
      session.capturing = true
      void Promise.resolve().then(() => {
        this.assertCurrent(session)
        return this.options.capture(socket, session.abort.signal)
      }).catch(error => this.fail(session, error)).finally(() => { session.capturing = false })
    }
    session.interval = setInterval(tick, Math.round(1000 / this.fps))
    if (immediately) tick()
  }

  private fail(session: StreamSession, error: unknown): void {
    if (this.session !== session) return
    this.session = null
    this.release(session)
    this.setState('error')
    this.options.onError(error instanceof Error ? error.message : String(error))
  }

  private release(session: StreamSession): void {
    if (session.interval !== null) clearInterval(session.interval)
    session.detach()
    session.abort.abort()
    const socket = session.socket
    if (socket && socket.readyState < 2) {
      try { socket.close(1000) } catch { /* The transport may already be closing. */ }
    }
  }
}
