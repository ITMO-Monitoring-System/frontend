import { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { getVisitSubjects, getVisitLecturesBySubject } from '../services/api'
import type { Subject } from '../types'
import './student-visits.css'

function fmtSeconds(s: number) {
  if (!s || s <= 0) return '0s'
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = Math.floor(s % 60)
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`
  return `${secs}s`
}

export default function StudentVisits() {
  const { user } = useContext(AuthContext)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubject, setSelectedSubject] = useState<number | ''>('')
  const [lectures, setLectures] = useState<Array<{ date: string; lecture_id: number; present_seconds: number; teacher_isu?: string }>>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [loadingLectures, setLoadingLectures] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [total, setTotal] = useState<number>(0)
  const [gapSeconds, setGapSeconds] = useState<number>(120)

  useEffect(() => {
    let mounted = true
    setLoadingSubjects(true)
    setError(null)
    getVisitSubjects()
      .then(r => {
        if (!mounted) return
        setSubjects(r.data.subjects || [])
      })
      .catch(e => {
        if (!mounted) return
        setError(e?.response?.data?.error || e.message || 'Ошибка загрузки')
      })
      .finally(() => {
        if (!mounted) return
        setLoadingSubjects(false)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (selectedSubject === '') {
      setLectures([])
      setTotal(0)
      return
    }
    fetchLectures(selectedSubject, page)
  }, [selectedSubject, page, pageSize, order, dateFrom, dateTo, gapSeconds])

  async function fetchLectures(subjectId: number | '', pageNum = 1) {
    if (!subjectId) return
    setLoadingLectures(true)
    setError(null)
    try {
      const params: any = { page: pageNum, page_size: pageSize, order, gap_seconds: gapSeconds }
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const res = await getVisitLecturesBySubject(subjectId, params)
      setLectures(res.data.items || [])
      setTotal(res.data.meta?.total ?? 0)
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Ошибка загрузки лекций')
      setLectures([])
      setTotal(0)
    } finally {
      setLoadingLectures(false)
    }
  }

  return (
    <div className="visits-card">
      <div className="visits-header">
        <div>
          <h3 className="visits-title">Аналитика посещений</h3>
          <div className="visits-sub">Просмотр посещаемости по предметам</div>
        </div>
        <div className="visits-user">{user ? `${user.name ?? user.id}` : 'Гость'}</div>
      </div>

      <div className="visits-body">
        <div className="controls-row">
          <div className="control">
            <label>Предмет</label>
            <select value={selectedSubject} onChange={e => { setSelectedSubject(e.target.value ? parseInt(e.target.value, 10) : ''); setPage(1) }}>
              <option value="">— выберите предмет —</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {loadingSubjects && <div className="hint">Загрузка предметов…</div>}
          </div>

          <div className="control">
            <label>Период с</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
          </div>

          <div className="control">
            <label>по</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
          </div>

          <div className="control">
            <label>Сортировка</label>
            <select value={order} onChange={e => { setOrder(e.target.value as any); setPage(1) }}>
              <option value="desc">по убыванию</option>
              <option value="asc">по возрастанию</option>
            </select>
          </div>

          <div className="control small">
            <label>gap (s)</label>
            <input type="number" min={0} value={gapSeconds} onChange={e => { setGapSeconds(Number(e.target.value || 0)); setPage(1) }} />
          </div>
        </div>

        <div className="table-wrap">
          {error && <div className="error">{error}</div>}
          {loadingLectures ? (
            <div className="hint">Загрузка лекций…</div>
          ) : lectures.length === 0 ? (
            <div className="hint">Лекций не найдено</div>
          ) : (
            <table className="visits-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Lecture ID</th>
                  <th>Время (на лекции)</th>
                  <th>Преподаватель ISU</th>
                </tr>
              </thead>
              <tbody>
                {lectures.map(it => (
                  <tr key={`${it.lecture_id}_${it.date}`}>
                    <td>{new Date(it.date).toLocaleString()}</td>
                    <td>{it.lecture_id}</td>
                    <td>{fmtSeconds(it.present_seconds)}</td>
                    <td>{it.teacher_isu ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="pager-row">
          <div className="pager-left">
            <div>Всего: {total}</div>
          </div>
          <div className="pager-right">
            <button className="btn" onClick={() => setPage(1)} disabled={page === 1}>Первая</button>
            <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Назад</button>
            <div className="page-indicator">Страница {page}</div>
            <button className="btn" onClick={() => setPage(p => p + 1)} disabled={lectures.length === 0}>Вперед</button>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
