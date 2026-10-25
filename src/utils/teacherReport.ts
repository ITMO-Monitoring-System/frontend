export type ReportLecture = { lecture_id: number; date: string; groups: string[] };
export type AttendanceRow = {
  lecture_id: number;
  group_code: string;
  isu: string;
  first_name: string;
  last_name: string;
  patronymic?: string | null;
  present_seconds: number;
  detection_count: number;
};
export type TeacherReport = { lectures: ReportLecture[]; items: AttendanceRow[] };
export type AttendanceConfig = {
  durationMinutes: number;
  presentThreshold: number;
  partialThreshold: number;
  gapSeconds: number;
};
export type AttendanceStatus = 'present' | 'partial' | 'low' | 'absent';
export const statusLabels: Record<AttendanceStatus, string> = {
  present: 'Присутствовал',
  partial: 'Частично',
  low: 'Ниже порога',
  absent: 'Нет отметок',
};
export const studentName = (row: AttendanceRow) =>
  [row.last_name, row.first_name, row.patronymic].filter(Boolean).join(' ');
export const attendancePercent = (row: AttendanceRow, config: AttendanceConfig) =>
  Math.min(100, (Math.max(0, row.present_seconds) / (config.durationMinutes * 60)) * 100);
export function attendanceStatus(row: AttendanceRow, config: AttendanceConfig): AttendanceStatus {
  if (!row.detection_count) return 'absent';
  const percent = attendancePercent(row, config);
  if (percent >= config.presentThreshold) return 'present';
  if (percent >= config.partialThreshold) return 'partial';
  return 'low';
}
export function summarizeAttendance(rows: AttendanceRow[], config: AttendanceConfig) {
  const present = rows.filter((row) => attendanceStatus(row, config) === 'present').length;
  const absent = rows.filter((row) => attendanceStatus(row, config) === 'absent').length;
  return {
    total: rows.length,
    present,
    absent,
    attendance: rows.length ? (present / rows.length) * 100 : 0,
    averagePresence: rows.length
      ? rows.reduce((total, row) => total + attendancePercent(row, config), 0) / rows.length
      : 0,
  };
}
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function weekStart(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDate(date);
}
export type ReportBucket = {
  key: string;
  label: string;
  rows: AttendanceRow[];
  lectureCount: number;
};
export function reportBuckets(
  report: TeacherReport,
  kind: 'lectures' | 'groups' | 'students' | 'weeks'
): ReportBucket[] {
  const buckets = new Map<string, ReportBucket>();
  const lectures = new Map(report.lectures.map((l) => [l.lecture_id, l]));
  const lectureSets = new Map<string, Set<number>>();
  const ensure = (key: string, label: string, lectureID: number) => {
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, rows: [], lectureCount: 0 });
      lectureSets.set(key, new Set());
    }
    lectureSets.get(key)!.add(lectureID);
    return buckets.get(key)!;
  };
  // Keep empty groups/lectures visible with a missing metric, rather than inventing 0% attendance.
  for (const lecture of report.lectures) {
    if (kind === 'lectures') ensure(String(lecture.lecture_id), lecture.date, lecture.lecture_id);
    if (kind === 'weeks')
      ensure(weekStart(lecture.date), weekStart(lecture.date), lecture.lecture_id);
    if (kind === 'groups')
      for (const group of lecture.groups) ensure(group, group, lecture.lecture_id);
  }
  for (const row of report.items) {
    const lecture = lectures.get(row.lecture_id);
    if (!lecture) continue;
    const key =
      kind === 'lectures'
        ? String(row.lecture_id)
        : kind === 'groups'
          ? row.group_code
          : kind === 'students'
            ? row.isu
            : weekStart(lecture.date);
    const label =
      kind === 'students'
        ? `${studentName(row)} · ${row.isu}`
        : kind === 'lectures'
          ? lecture.date
          : key;
    ensure(key, label, row.lecture_id).rows.push(row);
  }
  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, lectureCount: lectureSets.get(bucket.key)!.size }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru', { numeric: true }));
}
