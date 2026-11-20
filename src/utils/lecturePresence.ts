const PRESENCE_GAP_MS = 120_000
const RECENT_OBSERVATION_MS = 75_000
const FRAME_TIMEOUT_MS = 10_000

export type ObservationHistory = {
  times: number[]
  totalMs: number
}

function countInterval(from: number | undefined, to: number | undefined): number {
  if (from === undefined || to === undefined) return 0
  return to - from <= PRESENCE_GAP_MS ? to - from : 0
}

export function addObservation(history: ObservationHistory, timestamp: number): ObservationHistory {
  const { times, totalMs } = history
  let left = 0
  let right = times.length
  while (left < right) {
    const mid = Math.floor((left + right) / 2)
    if (times[mid] < timestamp) left = mid + 1
    else right = mid
  }
  if (times[left] === timestamp) return history
  const before = times[left - 1]
  const after = times[left]
  return {
    times: [...times.slice(0, left), timestamp, ...times.slice(left)],
    totalMs: totalMs - countInterval(before, after) +
      countInterval(before, timestamp) + countInterval(timestamp, after),
  }
}

export function presenceLabel(lastSeen: number, lastFrameReceivedAt: number | null, eventsConnected: boolean, now: number): string {
  if (!eventsConnected || lastFrameReceivedAt === null || now - lastFrameReceivedAt > FRAME_TIMEOUT_MS) {
    return 'Статус неизвестен'
  }
  return now - lastSeen > RECENT_OBSERVATION_MS ? 'Давно не распознавался' : 'Недавно распознавался'
}
