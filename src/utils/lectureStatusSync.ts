import type { Lecture } from '../types'

// The tracking response precedes the recognizing -> backend notification.
// Keep reading until the catalog confirms the transition, rather than assuming
// that the first successful HTTP response contains the new status.
export async function waitForLectureStatus(
  load: (signal: AbortSignal) => Promise<Lecture[] | undefined>,
  lectureId: number,
  expected: Lecture['status'],
  signal: AbortSignal,
  { timeoutMs = 30_000, intervalMs = 1_000 } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (!signal.aborted) {
    const lectures = await load(signal)
    if (signal.aborted) return false
    if (lectures?.some(lecture => lecture.id === lectureId && lecture.status === expected)) return true
    const remaining = deadline - Date.now()
    if (remaining <= 0) return false
    await new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        resolve()
      }
      const timer = setTimeout(done, Math.min(intervalMs, remaining))
      signal.addEventListener('abort', done, { once: true })
    })
  }
  return false
}
