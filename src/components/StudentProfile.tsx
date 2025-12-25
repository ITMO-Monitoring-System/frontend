import { useEffect, useMemo, useState } from 'react'
import type { AxiosProgressEvent } from 'axios'
import {
  uploadFaces,
  getVisitSubjects,
  getVisitLecturesBySubject,
  listSubjects,
  listLecturesBySubject,
} from '../services/api'
import type { Subject as SubjectType, Lecture as LectureType } from '../types'
import './student-profile.css'
import './student-visits.css'

type Slot = 'left' | 'center' | 'right'

function StudentFacesUpload() {
  const [isu, setIsu] = useState('')
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({})
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({})
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number>(0)

  useEffect(() => {
    return () => {
      Object.values(previews).forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
    }
  }, [previews])

  const onSelect = (slot: Slot, file: File | null) => {
    if (!file) return

    const maxMb = 8
    if (file.size > maxMb * 1024 * 1024) {
      alert(`Файл слишком большой (максимум ${maxMb} МБ)`)
      return
    }

    const previewUrl = URL.createObjectURL(file)

    if (previews[slot]) {
      URL.revokeObjectURL(previews[slot]!)
    }

    setFiles((prev) => ({ ...prev, [slot]: file }))
    setPreviews((prev) => ({ ...prev, [slot]: previewUrl }))
  }

  const removeSlot = (slot: Slot) => {
    if (previews[slot]) {
      URL.revokeObjectURL(previews[slot]!)
    }

    setFiles((prev) => {
      const newFiles = { ...prev }
      delete newFiles[slot]
      return newFiles
    })

    setPreviews((prev) => {
      const newPreviews = { ...prev }
      delete newPreviews[slot]
      return newPreviews
    })
  }

  const canUploadAll = () => {
    return isu.trim().length > 0 && files.left && files.center && files.right
  }

  const handleUpload = async () => {
    if (!isu.trim()) {
      alert('Введите ISU студента')
      return
    }

    if (!files.left || !files.center || !files.right) {
      alert('Выберите все три фотографии: левая, фронтальная и правая')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      await uploadFaces(isu, {
        left: files.left,
        right: files.right,
        center: files.center,
      }, (ev: AxiosProgressEvent) => {
        const loaded = ev.loaded ?? 0
        const total = ev.total ?? 0
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
        setProgress(pct)
      })

      alert('Фотографии успешно загружены')

      Object.values(previews).forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })

      setFiles({})
      setPreviews({})
      setIsu('')
      setProgress(0)
    } catch (err: any) {
      console.error('Ошибка загрузки фотографий:', err)

      let errorMessage = 'Ошибка загрузки фотографий'
      if (err.response?.data?.error) {
        errorMessage += `: ${err.response.data.error}`
      } else if (err.message) {
        errorMessage += `: ${err.message}`
      }

      alert(errorMessage)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="faces-card lowered">
      <div className="faces-header">
        <h3 className="faces-title">Загрузить фотографии по ISU</h3>
        <div className="faces-sub">Загрузите 3 фото: левая, фронтальная, правая</div>
      </div>

      <div className="faces-body">
        <label className="field-label">ISU студента</label>
        <input
          className="input"
          value={isu}
          onChange={(e) => setIsu(e.target.value.replace(/\D/g, ''))}
          placeholder="Введите ISU (только цифры)"
          disabled={uploading}
        />

        <div className="slots-row">
          {(['left', 'center', 'right'] as Slot[]).map((slot) => (
            <div className="slot" key={slot}>
              <div className="slot-label">
                {slot === 'left' && 'Левая'}
                {slot === 'center' && 'Фронтальная'}
                {slot === 'right' && 'Правая'}
              </div>
              <div className="slot-thumb">
                {files[slot] ? (
                  <div className="thumb">
                    <img src={previews[slot]} alt={slot} className="thumb-img" />
                    <button
                      className="thumb-remove"
                      onClick={() => removeSlot(slot)}
                      disabled={uploading}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="upload-box">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onSelect(slot, e.target.files?.[0] || null)}
                      disabled={uploading}
                      style={{ display: 'none' }}
                    />
                    <div className="upload-inner">
                      <div className="upload-plus">+</div>
                      <div className="upload-text">
                        {slot === 'left' && 'Левая'}
                        {slot === 'center' && 'Фронт'}
                        {slot === 'right' && 'Правая'}
                      </div>
                    </div>
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>

        {uploading && (
          <div className="progress-row">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-label">{progress}%</div>
          </div>
        )}

        <div className="actions-row">
          <button className="btn primary" onClick={handleUpload} disabled={!canUploadAll() || uploading} type="button">
            {uploading ? 'Загрузка…' : 'Загрузить фотографии'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------
   Компонент: StudentVisitsAnalytics
   (аналитика посещаемости; попытка взять данные из visits,
   fallback — на общие ручки из api.ts)
   --------------------------------------------- */

type VisitItem = {
  date: string
  lecture_id: number
  present_seconds: number
  teacher_isu?: string
}

function StudentVisitsAnalytics() {
  const [subjects, setSubjects] = useState<SubjectType[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [gapSeconds, setGapSeconds] = useState<number | undefined>(120)
  const [items, setItems] = useState<VisitItem[]>([])
  const [meta, setMeta] = useState<{ page: number; page_size: number; total: number }>({ page: 1, page_size: 20, total: 0 })
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [loadingLectures, setLoadingLectures] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Получаем subjects: сначала visits -> fallback listSubjects
  useEffect(() => {
    let mounted = true
    setLoadingSubjects(true)
    setError(null)

    getVisitSubjects()
      .then((res) => {
        // ожидаем { isu, subjects: Array<{id, name}> }
        const s = (res.data?.subjects ?? []) as SubjectType[]
        if (mounted && s.length > 0) {
          setSubjects(s)
          setSelected((prev) => prev ?? s[0].id)
        } else if (mounted) {
          // fallback: взять все предметы
          listSubjects()
            .then((r) => {
              const all = (r.data ?? []) as SubjectType[]
              setSubjects(all)
              setSelected((prev) => prev ?? (all[0]?.id ?? null))
            })
            .catch(() => {
              // ничего не сделали — оставляем пусто
            })
        }
      })
      .catch(() => {
        // fallback
        listSubjects()
          .then((r) => {
            const all = (r.data ?? []) as SubjectType[]
            if (!mounted) return
            setSubjects(all)
            setSelected((prev) => prev ?? (all[0]?.id ?? null))
          })
          .catch((err) => {
            if (!mounted) return
            setError('Не удалось загрузить список предметов')
            console.error(err)
          })
      })
      .finally(() => {
        if (mounted) setLoadingSubjects(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const loadLectures = async (subjectId: number | null, opts?: { resetPage?: boolean }) => {
    if (!subjectId) return
    const p = opts?.resetPage ? 1 : page
    setLoadingLectures(true)
    setError(null)

    // helper to set state from visit-like response
    const setFromVisitResponse = (data: any) => {
      const itemsFromApi = (data.items ?? []) as VisitItem[]
      const metaFromApi = data.meta ?? { page: p, page_size: pageSize, total: itemsFromApi.length }
      setItems(itemsFromApi)
      setMeta(metaFromApi)
      setPage(metaFromApi.page ?? p)
    }

    try {
      const res = await getVisitLecturesBySubject(subjectId, {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        order,
        page: p,
        page_size: pageSize,
        gap_seconds: gapSeconds,
      })
      // если есть items и не пусто — используем
      if (res.data && Array.isArray(res.data.items) && res.data.items.length > 0) {
        setFromVisitResponse(res.data)
        return
      }

      // если items пусты — fallback на listLecturesBySubject
      const fallback = await listLecturesBySubject(subjectId, dateFrom || undefined, dateTo || undefined)
      const lectures = (fallback.data ?? []) as LectureType[]
      // конвертируем LectureType[] -> VisitItem[] (present_seconds неизвестно)
      const converted = lectures.map((l) => ({
        date: l.date,
        lecture_id: l.id,
        present_seconds: 0,
        teacher_isu: (l.teacher_id as unknown) as string | undefined,
      }))
      setItems(converted)
      setMeta({ page: p, page_size: pageSize, total: converted.length })
    } catch (err: any) {
      // если getVisitLecturesBySubject упал — пробуем listLecturesBySubject
      try {
        const fallback = await listLecturesBySubject(subjectId, dateFrom || undefined, dateTo || undefined)
        const lectures = (fallback.data ?? []) as LectureType[]
        const converted = lectures.map((l) => ({
          date: l.date,
          lecture_id: l.id,
          present_seconds: 0,
          teacher_isu: (l.teacher_id as unknown) as string | undefined,
        }))
        setItems(converted)
        setMeta({ page: p, page_size: pageSize, total: converted.length })
      } catch (err2) {
        console.error(err, err2)
        setError('Не удалось загрузить лекции для выбранного предмета')
      }
    } finally {
      setLoadingLectures(false)
    }
  }

  useEffect(() => {
    if (selected !== null) loadLectures(selected, { resetPage: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, order, pageSize, gapSeconds])

  useEffect(() => {
    if (selected !== null) {
      const t = setTimeout(() => loadLectures(selected, { resetPage: true }), 300)
      return () => clearTimeout(t)
    }
  }, [dateFrom, dateTo, selected])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((meta.total || 0) / (meta.page_size || pageSize))),
    [meta, pageSize]
  )

  const onPrev = () => {
    if (page <= 1 || selected === null) return
    const np = page - 1
    setPage(np)
    loadLectures(selected, { resetPage: false })
  }

  const onNext = () => {
    if (page >= totalPages || selected === null) return
    const np = page + 1
    setPage(np)
    loadLectures(selected, { resetPage: false })
  }

  const formatSeconds = (s: number) => {
    if (!s) return '0s'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h ? h + 'h ' : ''}${m ? m + 'm ' : ''}${sec ? sec + 's' : ''}`.trim()
  }

  return (
    <div className="visits-card" style={{ marginTop: 18 }}>
      <div className="visits-header">
        <div className="visits-title">Аналитика посещаемости — лекции</div>
        <div className="visits-controls">
          <div className="control-row">
            <label className="label">Предмет</label>
            <div className="select-wrap">
              <select
                value={selected ?? ''}
                onChange={(e) => {
                  setSelected(Number(e.target.value))
                  setPage(1)
                }}
                disabled={loadingSubjects}
              >
                <option value="" disabled>
                  Выберите предмет
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="control-row">
            <label className="label">Период с</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
            />
            <label className="label">по</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="control-row small">
            <label className="label">Сортировка</label>
            <select value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}>
              <option value="desc">По убыванию</option>
              <option value="asc">По возрастанию</option>
            </select>
            <label className="label">Стр.</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <label className="label">Gap sec</label>
            <input
              type="number"
              min={0}
              value={gapSeconds ?? ''}
              onChange={(e) => setGapSeconds(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </div>
      </div>

      <div className="visits-body">
        {error && <div className="visits-error">{error}</div>}
        <div className="visits-table-wrap">
          <table className="visits-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Lecture ID</th>
                <th>Время присутствия</th>
                <th>Преподаватель ISU</th>
              </tr>
            </thead>
            <tbody>
              {loadingLectures ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Загрузка...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Нет данных
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={`${it.lecture_id}_${it.date}`}>
                    <td>{new Date(it.date).toLocaleString()}</td>
                    <td>{it.lecture_id}</td>
                    <td>{formatSeconds(it.present_seconds)}</td>
                    <td>{it.teacher_isu ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="visits-footer">
          <div className="pagination">
            <button onClick={onPrev} disabled={page <= 1}>
              ‹ Prev
            </button>
            <div className="page-info">
              Страница {meta.page} из {totalPages} • Всего записей: {meta.total}
            </div>
            <button onClick={onNext} disabled={page >= totalPages}>
              Next ›
            </button>
          </div>

          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                if (selected) loadLectures(selected, { resetPage: true })
              }}
            >
              Обновить
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setDateFrom('')
                setDateTo('')
                setOrder('desc')
                setGapSeconds(120)
                setPageSize(20)
                if (selected) loadLectures(selected, { resetPage: true })
              }}
            >
              Сбросить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StudentsProfile() {
  return (
    <div className="student-profile-page" style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>
      <h2>Профиль студента</h2>

      <StudentFacesUpload />

      <StudentVisitsAnalytics />
    </div>
  )
}
