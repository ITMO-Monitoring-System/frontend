import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForLectureStatus } from '../src/utils/lectureStatusSync.ts'

const lecture = status => [{ id: 7, status }]
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

for (const [before, after] of [['scheduled', 'running'], ['running', 'completed']]) {
  test(`waits for delayed ${before} -> ${after} notification`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    let calls = 0
    const pending = waitForLectureStatus(async () => lecture(++calls < 3 ? before : after), 7, after, new AbortController().signal)
    await flush()
    assert.equal(calls, 1)
    t.mock.timers.tick(1000)
    await flush()
    assert.equal(calls, 2)
    t.mock.timers.tick(1000)
    assert.equal(await pending, true)
    assert.equal(calls, 3)
  })
}

test('a transient request failure does not count as a confirmed transition', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let calls = 0
  const pending = waitForLectureStatus(async () => ++calls < 2 ? undefined : lecture('running'), 7, 'running', new AbortController().signal)
  await flush()
  t.mock.timers.tick(1000)
  assert.equal(await pending, true)
  assert.equal(calls, 2)
})

test('an absent lecture times out without reporting success or polling forever', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let calls = 0
  const pending = waitForLectureStatus(async () => { calls++; return [] }, 7, 'completed', new AbortController().signal, { timeoutMs: 2000 })
  await flush()
  t.mock.timers.tick(1000)
  await flush()
  t.mock.timers.tick(1000)
  assert.equal(await pending, false)
  const finalCalls = calls
  t.mock.timers.tick(60_000)
  await flush()
  assert.equal(calls, finalCalls)
})

test('stopping replaces a pending start check and discards its late response', async () => {
  const starting = new AbortController()
  let finishStart
  const pendingStart = waitForLectureStatus(() => new Promise(resolve => { finishStart = resolve }), 7, 'running', starting.signal)
  starting.abort()
  const pendingStop = waitForLectureStatus(async () => lecture('completed'), 7, 'completed', new AbortController().signal)
  assert.equal(await pendingStop, true)
  finishStart(lecture('running'))
  assert.equal(await pendingStart, false)
})

test('aborting on unmount cancels the retry timer immediately', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const controller = new AbortController()
  let calls = 0
  const pending = waitForLectureStatus(async () => { calls++; return lecture('running') }, 7, 'completed', controller.signal)
  await flush()
  controller.abort()
  assert.equal(await pending, false)
  t.mock.timers.tick(60_000)
  await flush()
  assert.equal(calls, 1)
})
