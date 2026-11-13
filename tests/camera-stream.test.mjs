import assert from 'node:assert/strict'
import test from 'node:test'
import { CameraStream } from '../src/services/cameraStream.ts'

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

class FakeSocket extends EventTarget {
  readyState = 0
  binaryType = 'blob'
  closeCalls = 0
  open() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }
  finishClose(code = 1006, reason = '') {
    this.readyState = 3
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }))
  }
  close() {
    this.closeCalls++
    this.readyState = 2
  }
  message(data) { this.dispatchEvent(new MessageEvent('message', { data })) }
}

function setup(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const sockets = [], states = [], errors = [], captures = [], messages = []
  const stream = new CameraStream({
    prepare: async () => {},
    getUrl: () => 'wss://example.test/tracking/ws/stream?lecture_id=4',
    createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket },
    capture: async (socket, signal) => { captures.push({ socket, signal }) },
    onStateChange: state => states.push(state),
    onError: message => errors.push(message),
    onMessage: event => messages.push(event.data),
    ...overrides,
  })
  t.after(() => stream.stop())
  return { stream, sockets, states, errors, captures, messages }
}

test('a 3-second handshake succeeds at 1 FPS; changing to 5 FPS keeps the socket', async t => {
  const { stream, sockets, captures, errors } = setup(t)
  stream.setFps(1)
  const started = stream.start()
  await flush()
  t.mock.timers.tick(3000)
  await flush()
  assert.equal(captures.length, 0)
  sockets[0].open()
  await started
  await flush()
  assert.equal(captures.length, 1)
  t.mock.timers.tick(999)
  await flush()
  assert.equal(captures.length, 1)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(captures.length, 2)
  stream.setFps(5)
  t.mock.timers.tick(200)
  await flush()
  assert.equal(captures.length, 3)
  assert.equal(sockets.length, 1)
  assert.deepEqual(errors, [])
})

test('concurrent starts share both camera preparation and the handshake', async t => {
  let preparations = 0
  const { stream, sockets } = setup(t, { prepare: async () => { preparations++ } })
  const first = stream.start()
  assert.equal(stream.start(), first)
  await flush()
  assert.equal(preparations, 1)
  assert.equal(sockets.length, 1)
  sockets[0].open()
  await first
  await stream.start()
  assert.equal(sockets.length, 1)
})

test('an early close reports its code and server rejection instead of a timeout', async t => {
  const { stream, sockets, errors } = setup(t)
  const started = stream.start()
  const rejected = assert.rejects(started, /код 1008.*Лекция не запущена/)
  await flush()
  sockets[0].message(JSON.stringify({ type: 'error', error: 'lecture_not_started' }))
  sockets[0].finishClose(1008)
  await rejected
  assert.equal(errors.length, 1)
  assert.equal(stream.isRunning(), false)
})

test('a handshake error fails immediately and can be retried without a page reload', async t => {
  const { stream, sockets, states, errors } = setup(t)
  const first = stream.start()
  const rejected = assert.rejects(first, /ошибка соединения/)
  await flush()
  sockets[0].dispatchEvent(new Event('error'))
  await rejected
  const retry = stream.start()
  await flush()
  sockets[1].open()
  await retry
  assert.equal(stream.isRunning(), true)
  assert.deepEqual(states, ['connecting', 'error', 'connecting', 'sending'])
  assert.equal(errors.length, 1)
})

test('a real 10-second timeout releases the socket and permits a fresh start', async t => {
  const { stream, sockets } = setup(t)
  const first = stream.start()
  const rejected = assert.rejects(first, /за 10 секунд/)
  await flush()
  t.mock.timers.tick(10_000)
  await rejected
  assert.equal(sockets[0].closeCalls, 1)
  const retry = stream.start()
  await flush()
  sockets[1].open()
  await retry
  assert.equal(stream.isRunning(), true)
})

test('cancelling while camera permission is pending does not open a socket later', async t => {
  let finishPrepare
  const { stream, sockets, states, errors } = setup(t, {
    prepare: () => new Promise(resolve => { finishPrepare = resolve }),
  })
  const started = stream.start()
  const rejected = assert.rejects(started, { name: 'AbortError' })
  await flush()
  stream.stop()
  await rejected
  finishPrepare()
  await flush()
  assert.equal(sockets.length, 0)
  assert.deepEqual(states, ['connecting', 'idle'])
  assert.deepEqual(errors, [])
})

test('cancelled handshake and late events from its socket cannot affect a new start', async t => {
  const { stream, sockets, messages, errors } = setup(t)
  const first = stream.start()
  const rejected = assert.rejects(first, { name: 'AbortError' })
  await flush()
  const old = sockets[0]
  stream.stop()
  const retry = stream.start()
  await flush()
  sockets[1].open()
  await retry
  await rejected
  old.finishClose(1006)
  old.message('old response')
  old.dispatchEvent(new Event('error'))
  assert.equal(stream.isRunning(), true)
  assert.deepEqual(messages, [])
  assert.deepEqual(errors, [])
})

test('an unexpected disconnect stops capture and allows reconnecting', async t => {
  const { stream, sockets, captures, states, errors } = setup(t)
  const first = stream.start()
  await flush()
  sockets[0].open()
  await first
  await flush()
  sockets[0].finishClose(1006, 'network lost')
  t.mock.timers.tick(2000)
  await flush()
  assert.equal(captures.length, 1)
  assert.equal(captures[0].signal.aborted, true)
  assert.match(errors[0], /код 1006.*network lost/)
  assert.equal(states.at(-1), 'error')
  const retry = stream.start()
  await flush()
  sockets[1].open()
  await retry
  assert.equal(stream.isRunning(), true)
})

test('slow JPEG encoding cannot accumulate overlapping captures', async t => {
  let finishCapture
  let calls = 0
  const { stream, sockets } = setup(t, {
    capture: () => {
      calls++
      return new Promise(resolve => { finishCapture = resolve })
    },
  })
  const started = stream.start()
  await flush()
  sockets[0].open()
  await started
  await flush()
  t.mock.timers.tick(2000)
  await flush()
  assert.equal(calls, 1)
  finishCapture()
  await flush()
  t.mock.timers.tick(200)
  await flush()
  assert.equal(calls, 2)
  finishCapture()
})

test('an old encoding failure cannot stop the next connection', async t => {
  let rejectOldCapture
  let calls = 0
  const { stream, sockets, errors } = setup(t, {
    capture: () => ++calls === 1
      ? new Promise((_, reject) => { rejectOldCapture = reject })
      : Promise.resolve(),
  })
  const first = stream.start()
  await flush()
  sockets[0].open()
  await first
  await flush()
  stream.stop()
  const retry = stream.start()
  await flush()
  sockets[1].open()
  await retry
  rejectOldCapture(new Error('stale encoding error'))
  await flush()
  assert.equal(stream.isRunning(), true)
  assert.deepEqual(errors, [])
})

test('late camera preparation failure after cancellation cannot affect a retry', async t => {
  let rejectOldPrepare
  let calls = 0
  const { stream, sockets, errors } = setup(t, {
    prepare: () => ++calls === 1
      ? new Promise((_, reject) => { rejectOldPrepare = reject })
      : Promise.resolve(),
  })
  const first = stream.start()
  const rejected = assert.rejects(first, { name: 'AbortError' })
  await flush()
  stream.stop()
  const retry = stream.start()
  await flush()
  sockets[0].open()
  await retry
  await rejected
  rejectOldPrepare(new Error('old camera error'))
  await flush()
  assert.equal(stream.isRunning(), true)
  assert.deepEqual(errors, [])
})
