import assert from 'node:assert/strict'
import test from 'node:test'
import { addObservation, presenceLabel } from '../src/utils/lecturePresence.ts'
import { attendanceStatus } from '../src/utils/teacherReport.ts'

test('49 observations keep presence current and measure 124 seconds', () => {
  let history = { times: [], totalMs: 0 }
  for (let index = 0; index < 49; index++) {
    const timestamp = Math.round(index * 124_000 / 48)
    history = addObservation(history, timestamp)
    assert.equal(presenceLabel(timestamp, timestamp, true, timestamp + 2_000), 'Недавно распознавался')
  }
  assert.equal(history.totalMs, 124_000)
  assert.equal(history.times.length, 49)
})

test('late observations fill gaps and repeated timestamps leave time unchanged', () => {
  let history = { times: [], totalMs: 0 }
  for (const timestamp of [150_000, 0, 70_000, 70_000, 300_000]) {
    history = addObservation(history, timestamp)
  }
  assert.deepEqual(history.times, [0, 70_000, 150_000, 300_000])
  assert.equal(history.totalMs, 150_000)
})

test('an old observation differs from a stalled camera or event connection', () => {
  assert.equal(presenceLabel(0, 80_000, true, 80_000), 'Давно не распознавался')
  assert.equal(presenceLabel(0, 0, true, 11_000), 'Статус неизвестен')
  assert.equal(presenceLabel(0, 0, false, 0), 'Статус неизвестен')
})

test('one observation in the teacher report records a visit with unknown duration', () => {
  const config = { durationMinutes: 90, presentThreshold: 80, partialThreshold: 50, gapSeconds: 120 }
  assert.equal(attendanceStatus({ detection_count: 1, present_seconds: 0 }, config), 'observed')
  assert.equal(attendanceStatus({ detection_count: 0, present_seconds: 0 }, config), 'absent')
})
