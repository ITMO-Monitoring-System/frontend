import React, { useEffect, useMemo, useState } from 'react'
import {
  getTeacherSubjects,
  getTeacherLecturesBySubject,
  getLectureGroups,
  getLectureGroupStudents,
} from '../services/api'
import './lecture-analytics.css'

interface TeacherSubject {
  id: number
  name: string
}

interface TeacherLecture {
  date: string
  lecture_id: number
}

interface TeacherGroup {
  group_code: string
}

interface TeacherStudent {
  isu: string
  last_name: string
  first_name: string
  patronymic: string
  present_seconds: number
}

type StudentsMeta = { page: number; page_size: number; total: number }

const DEFAULT_LECTURE_DURATION_MINUTES = (() => {
  const fromEnv = Number(import.meta.env.VITE_DEFAULT_LECTURE_DURATION_MINUTES)
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 90
})()

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

const formatSeconds = (seconds: number) => {
  if (!seconds || seconds <= 0) return '0s'
  const hh = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  const ss = Math.floor(seconds % 60)
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, '0')}m`
  if (mm > 0) return `${mm}m ${String(ss).padStart(2, '0')}s`
  return `${ss}s`
}

const getStatusByPercent = (percent: number, presentThreshold: number, partialThreshold: number) => {
  if (percent >= presentThreshold) return { label: 'Присутствовал', className: 'present' }
  if (percent >= partialThreshold) return { label: 'Частично', className: 'partial' }
  return { label: 'Ниже порога', className: 'absent' }
}

const fetchAllGroupStudents = async (lectureId: number, groupCode: string) => {
  const pageSize = 200
  const first = await getLectureGroupStudents(lectureId, groupCode, {
    page: 1,
    page_size: pageSize,
    gap_seconds: 1,
  })
  const items = [...(first.data.items || [])]
  const total = first.data.meta?.total ?? items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await getLectureGroupStudents(lectureId, groupCode, {
      page,
      page_size: pageSize,
      gap_seconds: 1,
    })
    items.push(...(next.data.items || []))
  }

  return items
}

const TeacherAnalytics: React.FC = () => {
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)
  const [teacherLectures, setTeacherLectures] = useState<TeacherLecture[]>([])
  const [selectedLectureId, setSelectedLectureId] = useState<number | null>(null)
  const [lectureGroups, setLectureGroups] = useState<TeacherGroup[]>([])
  const [selectedGroupCode, setSelectedGroupCode] = useState<string>('')
  const [teacherStudents, setTeacherStudents] = useState<TeacherStudent[]>([])
  const [studentsMeta, setStudentsMeta] = useState<StudentsMeta>({
    page: 1,
    page_size: 50,
    total: 0,
  })
  const [lectureDurationMinutes, setLectureDurationMinutes] = useState(DEFAULT_LECTURE_DURATION_MINUTES)
  const [presentThresholdInput, setPresentThresholdInput] = useState(80)
  const [partialThresholdInput, setPartialThresholdInput] = useState(30)
  const [subjectSummarySeconds, setSubjectSummarySeconds] = useState<number[][]>([])
  const [summaryError, setSummaryError] = useState('')
  const [loading, setLoading] = useState({
    subjects: false,
    lectures: false,
    groups: false,
    students: false,
    summary: false,
  })

  const lectureDurationSeconds = Math.max(60, Math.round(lectureDurationMinutes * 60))
  const presentThreshold = clampPercent(presentThresholdInput)
  const partialThreshold = Math.min(clampPercent(partialThresholdInput), presentThreshold)

  useEffect(() => {
    const loadTeacherSubjects = async () => {
      try {
        setLoading(prev => ({ ...prev, subjects: true }))
        const response = await getTeacherSubjects()
        setTeacherSubjects(response.data.subjects || [])
      } catch (error) {
        console.error('Ошибка загрузки предметов:', error)
        setTeacherSubjects([])
      } finally {
        setLoading(prev => ({ ...prev, subjects: false }))
      }
    }

    void loadTeacherSubjects()
  }, [])

  const loadSubjectSummary = async (lectures: TeacherLecture[]) => {
    if (!lectures.length) {
      setSubjectSummarySeconds([])
      return
    }

    setLoading(prev => ({ ...prev, summary: true }))
    setSummaryError('')
    try {
      const byLecture = await Promise.all(
        lectures.map(async lecture => {
          const groupsResponse = await getLectureGroups(lecture.lecture_id)
          const groups = groupsResponse.data.groups || []
          const seconds: number[] = []

          for (const group of groups) {
            const students = await fetchAllGroupStudents(lecture.lecture_id, group.group_code)
            students.forEach(student => {
              seconds.push(Math.max(0, student.present_seconds || 0))
            })
          }

          return seconds
        })
      )
      setSubjectSummarySeconds(byLecture)
    } catch (error) {
      console.error('Ошибка загрузки сводной аналитики:', error)
      setSummaryError('Не удалось посчитать сводную аналитику')
      setSubjectSummarySeconds([])
    } finally {
      setLoading(prev => ({ ...prev, summary: false }))
    }
  }

  const loadTeacherLectures = async (subjectId: number) => {
    try {
      setLoading(prev => ({ ...prev, lectures: true }))
      setTeacherLectures([])
      setSelectedLectureId(null)
      setLectureGroups([])
      setSelectedGroupCode('')
      setTeacherStudents([])
      setStudentsMeta({ page: 1, page_size: 50, total: 0 })
      setSubjectSummarySeconds([])

      const response = await getTeacherLecturesBySubject(subjectId, {
        order: 'desc',
        page: 1,
        page_size: 200,
      })
      const lectures = response.data.items || []
      setTeacherLectures(lectures)
      void loadSubjectSummary(lectures)
    } catch (error) {
      console.error('Ошибка загрузки лекций:', error)
      setTeacherLectures([])
      setSubjectSummarySeconds([])
    } finally {
      setLoading(prev => ({ ...prev, lectures: false }))
    }
  }

  const loadLectureGroups = async (lectureId: number) => {
    try {
      setLoading(prev => ({ ...prev, groups: true }))
      setLectureGroups([])
      setSelectedGroupCode('')
      setTeacherStudents([])
      setStudentsMeta({ page: 1, page_size: 50, total: 0 })

      const response = await getLectureGroups(lectureId)
      setLectureGroups(response.data.groups || [])
    } catch (error) {
      console.error('Ошибка загрузки групп:', error)
      setLectureGroups([])
    } finally {
      setLoading(prev => ({ ...prev, groups: false }))
    }
  }

  const loadGroupStudents = async (lectureId: number, groupCode: string, page = 1) => {
    try {
      setLoading(prev => ({ ...prev, students: true }))
      const response = await getLectureGroupStudents(lectureId, groupCode, {
        page,
        page_size: studentsMeta.page_size,
        gap_seconds: 1,
      })
      setTeacherStudents(response.data.items || [])
      setStudentsMeta(response.data.meta)
    } catch (error) {
      console.error('Ошибка загрузки студентов:', error)
      setTeacherStudents([])
      setStudentsMeta(prev => ({ ...prev, total: 0 }))
    } finally {
      setLoading(prev => ({ ...prev, students: false }))
    }
  }

  useEffect(() => {
    if (selectedSubjectId !== null) {
      void loadTeacherLectures(selectedSubjectId)
    } else {
      setTeacherLectures([])
      setSelectedLectureId(null)
      setSubjectSummarySeconds([])
    }
  }, [selectedSubjectId])

  useEffect(() => {
    if (selectedLectureId !== null) {
      void loadLectureGroups(selectedLectureId)
    } else {
      setLectureGroups([])
      setSelectedGroupCode('')
    }
  }, [selectedLectureId])

  useEffect(() => {
    if (selectedLectureId !== null && selectedGroupCode) {
      void loadGroupStudents(selectedLectureId, selectedGroupCode)
    } else {
      setTeacherStudents([])
      setStudentsMeta(prev => ({ ...prev, total: 0 }))
    }
  }, [selectedLectureId, selectedGroupCode])

  const summary = useMemo(() => {
    const totalLectures = subjectSummarySeconds.length
    if (!totalLectures) {
      return {
        averageAttendancePercent: 0,
        totalLectures: 0,
        averagePresentCount: 0,
        averageStudentsCount: 0,
      }
    }

    const presentThresholdSeconds = lectureDurationSeconds * (presentThreshold / 100)
    let normalizedAttendanceSum = 0
    let totalStudents = 0
    let totalPresentByThreshold = 0

    subjectSummarySeconds.forEach(lectureStudentsSeconds => {
      lectureStudentsSeconds.forEach(seconds => {
        totalStudents += 1
        const normalized = Math.min(Math.max(seconds, 0) / lectureDurationSeconds, 1)
        normalizedAttendanceSum += normalized
        if (seconds >= presentThresholdSeconds) {
          totalPresentByThreshold += 1
        }
      })
    })

    return {
      averageAttendancePercent: totalStudents ? (normalizedAttendanceSum / totalStudents) * 100 : 0,
      totalLectures,
      averagePresentCount: totalLectures ? totalPresentByThreshold / totalLectures : 0,
      averageStudentsCount: totalLectures ? totalStudents / totalLectures : 0,
    }
  }, [subjectSummarySeconds, lectureDurationSeconds, presentThreshold])

  const exportAnalyticsToCSV = () => {
    if (!teacherStudents.length) {
      alert('Нет данных для экспорта')
      return
    }

    const headers = [
      'ISU',
      'Фамилия',
      'Имя',
      'Отчество',
      'Время присутствия',
      'Время присутствия (сек)',
      'Посещаемость (%)',
      'Статус',
    ]

    const rows = teacherStudents.map(student => {
      const attendancePercent = Math.min(
        100,
        (Math.max(0, student.present_seconds || 0) / lectureDurationSeconds) * 100
      )
      const status = getStatusByPercent(attendancePercent, presentThreshold, partialThreshold)
      return [
        student.isu,
        student.last_name,
        student.first_name,
        student.patronymic || '',
        formatSeconds(student.present_seconds),
        String(student.present_seconds),
        attendancePercent.toFixed(1),
        status.label,
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    const subjectName = teacherSubjects.find(subject => subject.id === selectedSubjectId)?.name || 'subject'
    const fileName = `analytics_${subjectName}_lecture_${selectedLectureId}_group_${selectedGroupCode}.csv`

    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const maxStudentsPage = Math.max(1, Math.ceil(studentsMeta.total / studentsMeta.page_size))

  return (
    <div className="analytics-container">
      <div className="analytics-filters">
        <div className="filter-row">
          <div className="filter-group">
            <label>Предмет</label>
            <select
              className="filter-select"
              value={selectedSubjectId ?? ''}
              onChange={e => setSelectedSubjectId(e.target.value ? Number(e.target.value) : null)}
              disabled={loading.subjects}
            >
              <option value="">Выберите предмет</option>
              {teacherSubjects.map(subject => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Лекция</label>
            <select
              className="filter-select"
              value={selectedLectureId ?? ''}
              onChange={e => setSelectedLectureId(e.target.value ? Number(e.target.value) : null)}
              disabled={!selectedSubjectId || loading.lectures}
            >
              <option value="">Выберите лекцию</option>
              {teacherLectures.map(lecture => (
                <option key={lecture.lecture_id} value={lecture.lecture_id}>
                  {new Date(lecture.date).toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Группа</label>
            <select
              className="filter-select"
              value={selectedGroupCode}
              onChange={e => setSelectedGroupCode(e.target.value)}
              disabled={!selectedLectureId || loading.groups}
            >
              <option value="">Выберите группу</option>
              {lectureGroups.map(group => (
                <option key={group.group_code} value={group.group_code}>
                  {group.group_code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="analytics-config-row">
          <div className="filter-group compact">
            <label>Длительность лекции (мин)</label>
            <input
              className="filter-input"
              type="number"
              min={1}
              step={1}
              value={lectureDurationMinutes}
              onChange={e => setLectureDurationMinutes(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="filter-group compact">
            <label>Порог «присутствовал» (%)</label>
            <input
              className="filter-input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={presentThresholdInput}
              onChange={e => setPresentThresholdInput(Number(e.target.value) || 0)}
            />
          </div>
          <div className="filter-group compact">
            <label>Порог «частично» (%)</label>
            <input
              className="filter-input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={partialThresholdInput}
              onChange={e => setPartialThresholdInput(Number(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="analytics-content">
        <div className="analytics-summary">
          <div className="summary-item">
            <span className="summary-label">Средняя посещаемость</span>
            <strong>{summary.averageAttendancePercent.toFixed(1)}%</strong>
          </div>
          <div className="summary-item">
            <span className="summary-label">Всего лекций</span>
            <strong>{summary.totalLectures}</strong>
          </div>
          <div className="summary-item">
            <span className="summary-label">Средняя явка</span>
            <strong>{summary.averagePresentCount.toFixed(1)} из {summary.averageStudentsCount.toFixed(1)}</strong>
          </div>
        </div>

        {summaryError ? <div className="analytics-warning">{summaryError}</div> : null}
        {loading.summary ? <div className="analytics-hint">Пересчитываем сводные метрики...</div> : null}

        {loading.students ? (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Загрузка данных...</p>
          </div>
        ) : teacherStudents.length > 0 ? (
          <>
            <div className="analytics-actions">
              <div className="analytics-stats">
                <span>Всего студентов: <strong>{studentsMeta.total}</strong></span>
                <span>Страница: <strong>{studentsMeta.page}</strong> из <strong>{maxStudentsPage}</strong></span>
              </div>
              <button className="btn primary" onClick={exportAnalyticsToCSV}>
                Экспорт в CSV
              </button>
            </div>

            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>ISU</th>
                    <th>Фамилия</th>
                    <th>Имя</th>
                    <th>Отчество</th>
                    <th>Время присутствия</th>
                    <th>Посещаемость</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherStudents.map(student => {
                    const attendancePercent = Math.min(
                      100,
                      (Math.max(0, student.present_seconds || 0) / lectureDurationSeconds) * 100
                    )
                    const status = getStatusByPercent(attendancePercent, presentThreshold, partialThreshold)
                    return (
                      <tr key={student.isu}>
                        <td>{student.isu}</td>
                        <td>{student.last_name}</td>
                        <td>{student.first_name}</td>
                        <td>{student.patronymic || '-'}</td>
                        <td>{formatSeconds(student.present_seconds)}</td>
                        <td>
                          <div className="presence-cell">
                            <span>{attendancePercent.toFixed(1)}%</span>
                            <div className="presence-bar">
                              <div className="presence-fill" style={{ width: `${attendancePercent}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {studentsMeta.total > studentsMeta.page_size ? (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => {
                    if (selectedLectureId !== null && selectedGroupCode && studentsMeta.page > 1) {
                      void loadGroupStudents(selectedLectureId, selectedGroupCode, studentsMeta.page - 1)
                    }
                  }}
                  disabled={studentsMeta.page <= 1 || !selectedLectureId || !selectedGroupCode}
                >
                  ← Назад
                </button>
                <span className="pagination-info">
                  Страница {studentsMeta.page} из {maxStudentsPage}
                </span>
                <button
                  className="pagination-btn"
                  onClick={() => {
                    if (selectedLectureId !== null && selectedGroupCode && studentsMeta.page < maxStudentsPage) {
                      void loadGroupStudents(selectedLectureId, selectedGroupCode, studentsMeta.page + 1)
                    }
                  }}
                  disabled={studentsMeta.page >= maxStudentsPage || !selectedLectureId || !selectedGroupCode}
                >
                  Вперёд →
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="analytics-empty">
            {!selectedSubjectId && !selectedLectureId && !selectedGroupCode ? (
              <>
                <h3>Выберите предмет, лекцию и группу</h3>
                <p>Для просмотра статистики выберите предмет, затем лекцию и группу</p>
              </>
            ) : (
              <>
                <h3>Нет данных</h3>
                <p>По выбранным критериям нет данных о посещаемости</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TeacherAnalytics
