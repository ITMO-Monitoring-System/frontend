import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getTeacherReport, getTeacherSubjects } from '../services/api';
import { apiError } from '../utils/apiError';
import { downloadCsv, downloadWorkbook, type ExportCell } from '../utils/reportExport';
import {
  attendancePercent,
  attendanceStatus,
  localDate,
  reportBuckets,
  statusLabels,
  studentName,
  summarizeAttendance,
  type AttendanceConfig,
  type AttendanceRow,
  type TeacherReport,
} from '../utils/teacherReport';
import './lecture-analytics.css';

const envDuration = Number(import.meta.env.VITE_DEFAULT_LECTURE_DURATION_MINUTES);
const defaultConfig: AttendanceConfig = {
  durationMinutes:
    Number.isFinite(envDuration) && envDuration >= 1 && envDuration <= 600 ? envDuration : 90,
  presentThreshold: 80,
  partialThreshold: 30,
  gapSeconds: 180,
};
const initialFrom = () => {
  const date = new Date();
  date.setDate(date.getDate() - 89);
  return localDate(date);
};
const dateLabel = (value: string) =>
  new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const percentLabel = (value: number, total: number) => (total ? `${value.toFixed(1)}%` : '—');
const rowKey = (row: AttendanceRow) => `${row.lecture_id}:${row.group_code}:${row.isu}`;
type View = 'lectures' | 'groups' | 'students' | 'details';
const views: { id: View; label: string }[] = [
  { id: 'lectures', label: 'По лекциям' },
  { id: 'groups', label: 'По группам' },
  { id: 'students', label: 'По студентам' },
  { id: 'details', label: 'Отметки и отсутствующие' },
];

export default function TeacherAnalytics() {
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsError, setSubjectsError] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(() => localDate(new Date()));
  const [config, setConfig] = useState(defaultConfig);
  const [configError, setConfigError] = useState('');
  const [result, setResult] = useState<{ key: string; report: TeacherReport } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [lectureId, setLectureId] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [studentISU, setStudentISU] = useState('');
  const [view, setView] = useState<View>('lectures');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const requestKey = `${subjectId}:${dateFrom}:${dateTo}:${config.gapSeconds}:${refresh}`;
  const report = result?.key === requestKey ? result.report : null;

  useEffect(() => {
    let active = true;
    setSubjectsLoading(true);
    setSubjectsError('');
    getTeacherSubjects()
      .then((r) => {
        if (active) setSubjects(r.data.subjects || []);
      })
      .catch((e) => {
        if (active) setSubjectsError(apiError(e, 'Не удалось загрузить предметы.'));
      })
      .finally(() => {
        if (active) setSubjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setResult(null);
    setPage(1);
    setExportError('');
    if (!subjectId || !dateFrom || !dateTo) {
      setLoading(false);
      return () => controller.abort();
    }
    const from = new Date(`${dateFrom}T00:00:00`);
    const until = new Date(`${dateTo}T00:00:00`);
    until.setDate(until.getDate() + 1);
    if (until <= from || until.getTime() - from.getTime() > 366 * 86400000) {
      setError('Выберите период от 1 до 366 дней.');
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    getTeacherReport(
      Number(subjectId),
      {
        date_from: from.toISOString(),
        date_to: until.toISOString(),
        gap_seconds: config.gapSeconds,
      },
      controller.signal
    )
      .then((r) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, report: r.data });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(apiError(e, 'Не удалось загрузить отчёт. Повторите попытку.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [subjectId, dateFrom, dateTo, config.gapSeconds, requestKey]);

  const resetScope = () => {
    setLectureId('');
    setGroupCode('');
    setStudentISU('');
    setPage(1);
  };
  const groupOptions = useMemo(
    () =>
      [
        ...new Set(
          (report?.lectures || [])
            .filter((l) => !lectureId || l.lecture_id === Number(lectureId))
            .flatMap((l) => l.groups)
        ),
      ].sort(),
    [report, lectureId]
  );
  const studentOptions = useMemo(() => {
    const students = new Map<string, AttendanceRow>();
    for (const row of report?.items || []) {
      if (
        (!lectureId || row.lecture_id === Number(lectureId)) &&
        (!groupCode || row.group_code === groupCode)
      )
        students.set(row.isu, row);
    }
    return [...students.values()].sort(
      (a, b) => studentName(a).localeCompare(studentName(b), 'ru') || a.isu.localeCompare(b.isu)
    );
  }, [report, lectureId, groupCode]);
  const scoped = useMemo<TeacherReport>(() => {
    if (!report) return { lectures: [], items: [] };
    const items = report.items.filter(
      (r) =>
        (!lectureId || r.lecture_id === Number(lectureId)) &&
        (!groupCode || r.group_code === groupCode) &&
        (!studentISU || r.isu === studentISU)
    );
    const studentLectureIDs = new Set(items.map((r) => r.lecture_id));
    const lectures = report.lectures
      .filter(
        (l) =>
          (!lectureId || l.lecture_id === Number(lectureId)) &&
          (!groupCode || l.groups.includes(groupCode)) &&
          (!studentISU || studentLectureIDs.has(l.lecture_id))
      )
      .map((l) => ({
        ...l,
        groups: groupCode ? l.groups.filter((g) => g === groupCode) : l.groups,
      }));
    return { lectures, items };
  }, [report, lectureId, groupCode, studentISU]);
  const summary = useMemo(() => summarizeAttendance(scoped.items, config), [scoped, config]);
  const weeks = useMemo(() => reportBuckets(scoped, 'weeks'), [scoped]);
  const buckets = useMemo(
    () => (view === 'details' ? [] : reportBuckets(scoped, view)),
    [scoped, view]
  );
  const detailRows = useMemo(
    () =>
      scoped.items.filter((row) => !statusFilter || attendanceStatus(row, config) === statusFilter),
    [scoped, statusFilter, config]
  );
  const count = view === 'details' ? detailRows.length : buckets.length;
  const maxPage = Math.max(1, Math.ceil(count / 50));
  const visiblePage = Math.min(page, maxPage);
  const sliceStart = (visiblePage - 1) * 50;
  const lectureById = new Map(scoped.lectures.map((l) => [l.lecture_id, l]));
  const subjectName = subjects.find((s) => s.id === Number(subjectId))?.name || subjectId;

  const applyConfig = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = {
      durationMinutes: Number(data.get('duration')),
      presentThreshold: Number(data.get('present')),
      partialThreshold: Number(data.get('partial')),
      gapSeconds: Number(data.get('gap')),
    };
    if (next.partialThreshold >= next.presentThreshold) {
      setConfigError('Порог «частично» должен быть ниже порога «присутствовал».');
      return;
    }
    setConfig(next);
    setConfigError('');
    setPage(1);
  };

  const exportReport = async (format: 'csv' | 'xlsx') => {
    if (!report || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const metadata: ExportCell[][] = [
        ['Предмет', subjectName],
        ['Период', dateFrom, dateTo],
        ['Лекция', lectureId || 'Все'],
        ['Группа', groupCode || 'Все'],
        ['Студент', studentISU || 'Все'],
        ['Длительность лекции (мин)', config.durationMinutes],
        ['Порог присутствия (%)', config.presentThreshold],
        ['Порог частичного присутствия (%)', config.partialThreshold],
        ['Допустимый разрыв (сек)', config.gapSeconds],
        ['Состав групп', 'Текущий состав; будущие лекции исключены'],
      ];
      const details: ExportCell[][] = [
        [
          'Лекция',
          'Дата',
          'Группа',
          'ИСУ',
          'ФИО',
          'Присутствие (сек)',
          'Присутствие (%)',
          'Отметок',
          'Статус',
        ],
        ...scoped.items.map((r) => [
          r.lecture_id,
          dateLabel(lectureById.get(r.lecture_id)!.date),
          r.group_code,
          r.isu,
          studentName(r),
          r.present_seconds,
          Number(attendancePercent(r, config).toFixed(1)),
          r.detection_count,
          statusLabels[attendanceStatus(r, config)],
        ]),
      ];
      const name = `attendance_${subjectId}_${dateFrom}_${dateTo}`;
      if (format === 'csv') downloadCsv([...metadata, [], ...details], `${name}.csv`);
      else {
        const summarySheet = (
          kind: 'lectures' | 'groups' | 'students' | 'weeks'
        ): ExportCell[][] => [
          [
            'Раздел',
            'Лекций',
            'Студент × лекция',
            'Присутствовали',
            'Нет отметок',
            'Посещаемость (%)',
            'Среднее присутствие (%)',
          ],
          ...reportBuckets(scoped, kind).map((b) => {
            const s = summarizeAttendance(b.rows, config);
            return [
              kind === 'lectures' ? dateLabel(b.label) : b.label,
              b.lectureCount,
              s.total,
              s.present,
              s.absent,
              s.total ? Number(s.attendance.toFixed(1)) : '',
              s.total ? Number(s.averagePresence.toFixed(1)) : '',
            ];
          }),
        ];
        await downloadWorkbook(
          [
            { name: 'Параметры', rows: metadata },
            { name: 'Отметки', rows: details },
            { name: 'Лекции', rows: summarySheet('lectures') },
            { name: 'Группы', rows: summarySheet('groups') },
            { name: 'Студенты', rows: summarySheet('students') },
            { name: 'Недели', rows: summarySheet('weeks') },
          ],
          `${name}.xlsx`
        );
      }
    } catch {
      setExportError('Не удалось сформировать файл. Повторите экспорт.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="teacher-report">
      <div className="report-filters">
        <label>
          Предмет
          <select
            value={subjectId}
            disabled={subjectsLoading}
            onChange={(e) => {
              setSubjectId(e.target.value);
              resetScope();
            }}
          >
            <option value="">{subjectsLoading ? 'Загрузка…' : 'Выберите предмет'}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Период с
          <input
            aria-label="Период с"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetScope();
            }}
          />
        </label>
        <label>
          Период по
          <input
            aria-label="Период по"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              resetScope();
            }}
          />
        </label>
        <button
          className="report-btn"
          type="button"
          disabled={loading}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Обновить
        </button>
      </div>
      {subjectsError && (
        <p className="report-error" role="alert">
          {subjectsError}
        </p>
      )}
      {!subjectsLoading && !subjectsError && !subjects.length && (
        <p className="report-hint">У вас пока нет предметов с лекциями.</p>
      )}
      <details className="report-settings">
        <summary>
          Настройки расчёта · {config.durationMinutes} мин · порог {config.presentThreshold}% ·
          разрыв {config.gapSeconds} сек
        </summary>
        <form onSubmit={applyConfig} className="report-settings-form">
          <label>
            Длительность, мин
            <input
              name="duration"
              type="number"
              min={1}
              max={600}
              step={1}
              required
              defaultValue={config.durationMinutes}
            />
          </label>
          <label>
            Присутствовал, %
            <input
              name="present"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              defaultValue={config.presentThreshold}
            />
          </label>
          <label>
            Частично, %
            <input
              name="partial"
              type="number"
              min={1}
              max={99}
              step={1}
              required
              defaultValue={config.partialThreshold}
            />
          </label>
          <label>
            Допустимый разрыв, сек
            <input
              name="gap"
              type="number"
              min={5}
              max={600}
              step={1}
              required
              defaultValue={config.gapSeconds}
            />
          </label>
          <button className="report-btn" type="submit">
            Применить
          </button>
        </form>
        <p className="report-hint">
          Время — сумма интервалов между соседними отметками. Разрывы длиннее выбранного значения не
          учитываются. Длительность применяется ко всем лекциям отчёта, поскольку фактическое время
          окончания не сохраняется.
        </p>
        {configError && (
          <p className="report-error" role="alert">
            {configError}
          </p>
        )}
      </details>
      {error && (
        <p className="report-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="report-empty" role="status">
          Загружаем полный отчёт…
        </p>
      )}
      {!subjectId && !subjectsError && (
        <p className="report-empty">Выберите предмет, чтобы увидеть посещаемость за период.</p>
      )}
      {report && (
        <>
          <div className="report-scope">
            <label>
              Лекция
              <select
                value={lectureId}
                onChange={(e) => {
                  setLectureId(e.target.value);
                  setGroupCode('');
                  setStudentISU('');
                  setPage(1);
                }}
              >
                <option value="">Все лекции</option>
                {report.lectures.map((l) => (
                  <option key={l.lecture_id} value={l.lecture_id}>
                    {dateLabel(l.date)} · №{l.lecture_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Группа
              <select
                value={groupCode}
                onChange={(e) => {
                  setGroupCode(e.target.value);
                  setStudentISU('');
                  setPage(1);
                }}
              >
                <option value="">Все группы</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Студент
              <select
                value={studentISU}
                onChange={(e) => {
                  setStudentISU(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все студенты</option>
                {studentOptions.map((s) => (
                  <option key={s.isu} value={s.isu}>
                    {studentName(s)} · {s.isu}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="report-metrics">
            <div>
              <span>Лекций в выборке</span>
              <strong>{scoped.lectures.length}</strong>
            </div>
            <div>
              <span>Посещаемость по порогу</span>
              <strong>{percentLabel(summary.attendance, summary.total)}</strong>
              <small>
                {summary.present} из {summary.total} студент × лекция
              </small>
            </div>
            <div>
              <span>Среднее время присутствия</span>
              <strong>{percentLabel(summary.averagePresence, summary.total)}</strong>
              <small>от {config.durationMinutes} минут</small>
            </div>
            <div>
              <span>Без отметок</span>
              <strong>{summary.absent}</strong>
              <small>случаев за период</small>
            </div>
          </div>
          <p className="report-hint">
            Расчёт по текущему составу групп. Будущие лекции исключены. «Нет отметок» означает
            отсутствие распознаваний, а не подтверждённый пропуск.
          </p>
          {weeks.length > 0 && (
            <section className="report-weekly" aria-label="Посещаемость по неделям">
              <h4>Динамика по неделям</h4>
              <div className="report-week-list">
                {weeks.map((week) => {
                  const s = summarizeAttendance(week.rows, config);
                  return (
                    <div key={week.key} className="report-week">
                      <span>
                        с{' '}
                        {new Date(`${week.key}T00:00:00`).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                      <div
                        className="report-bar"
                        role="img"
                        aria-label={`${week.key}: ${percentLabel(s.attendance, s.total)}`}
                      >
                        <i style={{ width: `${s.attendance}%` }} />
                      </div>
                      <strong>{percentLabel(s.attendance, s.total)}</strong>
                      <small>
                        {s.present}/{s.total}
                      </small>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <div className="report-toolbar">
            <div className="report-tabs" role="group" aria-label="Вид отчёта">
              {views.map((v) => (
                <button
                  className="report-btn"
                  key={v.id}
                  aria-pressed={view === v.id}
                  onClick={() => {
                    setView(v.id);
                    setPage(1);
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="report-export">
              <button
                className="report-btn"
                disabled={exporting || !scoped.items.length}
                onClick={() => void exportReport('csv')}
              >
                CSV
              </button>
              <button
                className="report-btn"
                disabled={exporting || !scoped.items.length}
                onClick={() => void exportReport('xlsx')}
              >
                {exporting ? 'Экспорт…' : 'Excel'}
              </button>
            </div>
          </div>
          <p className="report-hint">
            Экспорт включает все строки выбранных лекций, групп и студентов, независимо от страницы
            и фильтра статуса.
          </p>
          {exportError && (
            <p className="report-error" role="alert">
              {exportError}
            </p>
          )}
          {view === 'details' && (
            <label className="report-status-filter">
              Статус
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все статусы</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {count === 0 ? (
            <p className="report-empty">
              {!scoped.lectures.length
                ? 'За выбранный период лекций нет.'
                : 'Нет записей для выбранных фильтров.'}
            </p>
          ) : (
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  {view === 'details' ? (
                    <tr>
                      <th>Дата / лекция</th>
                      <th>Студент / ИСУ</th>
                      <th>Группа</th>
                      <th>Присутствие</th>
                      <th>Статус</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>{views.find((v) => v.id === view)?.label}</th>
                      <th>Лекций</th>
                      <th>Присутствовали</th>
                      <th>Нет отметок</th>
                      <th>Посещаемость</th>
                      <th>Среднее присутствие</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {view === 'details'
                    ? detailRows.slice(sliceStart, sliceStart + 50).map((row) => (
                        <tr key={rowKey(row)}>
                          <td>
                            {dateLabel(lectureById.get(row.lecture_id)!.date)}
                            <small>№{row.lecture_id}</small>
                          </td>
                          <td>
                            {studentName(row)}
                            <small>{row.isu}</small>
                          </td>
                          <td>{row.group_code}</td>
                          <td>
                            {Math.floor(row.present_seconds / 60)} мин ·{' '}
                            {attendancePercent(row, config).toFixed(1)}%
                            <small>{row.detection_count} отметок</small>
                          </td>
                          <td>
                            <span className={`report-status ${attendanceStatus(row, config)}`}>
                              {statusLabels[attendanceStatus(row, config)]}
                            </span>
                          </td>
                        </tr>
                      ))
                    : buckets.slice(sliceStart, sliceStart + 50).map((bucket) => {
                        const s = summarizeAttendance(bucket.rows, config);
                        return (
                          <tr key={bucket.key}>
                            <td>
                              {view === 'lectures' ? (
                                <>
                                  {dateLabel(bucket.label)}
                                  <small>№{bucket.key}</small>
                                </>
                              ) : (
                                bucket.label
                              )}
                            </td>
                            <td>{bucket.lectureCount}</td>
                            <td>
                              {s.present} / {s.total}
                            </td>
                            <td>{s.absent}</td>
                            <td>{percentLabel(s.attendance, s.total)}</td>
                            <td>{percentLabel(s.averagePresence, s.total)}</td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
          {count > 0 && (
            <div className="report-pagination">
              <span>Всего записей: {count}</span>
              <button
                className="report-btn"
                disabled={visiblePage <= 1}
                onClick={() => setPage(visiblePage - 1)}
              >
                Назад
              </button>
              <span>
                {visiblePage} / {maxPage}
              </span>
              <button
                className="report-btn"
                disabled={visiblePage >= maxPage}
                onClick={() => setPage(visiblePage + 1)}
              >
                Далее
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
