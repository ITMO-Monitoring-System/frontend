import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AxiosProgressEvent } from 'axios'
import {
  uploadFaces,
  getVisitSubjects,
  getVisitLecturesBySubject,
  getConsents,
  giveBiometricConsent,
  revokeBiometricConsent,
  getMyFacesMeta,
  getMyFaceBlob,
} from '../services/api'
import { AuthContext } from '../contexts/AuthContext'
import type { Subject as SubjectType } from '../types'
import ConsentModal from './ConsentModal'
import {
  BIOMETRIC_CONSENT_TITLE,
  BIOMETRIC_CONSENT_TEXT,
  BIOMETRIC_CONSENT_VERSION,
} from '../legal/consent'
import './student-profile.css'
import './student-visits.css'
import './consent.css'

type Slot = 'left' | 'center' | 'right'

function PhotoStatusBadge() {
  const auth = useContext(AuthContext)
  const hasPhotos = auth?.user?.has_photos

  if (hasPhotos === undefined) return null

  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: 8,
        marginBottom: 12,
        fontSize: 14,
        fontWeight: 600,
        background: hasPhotos ? '#dcfce7' : '#fef9c3',
        color: hasPhotos ? '#166534' : '#854d0e',
        border: `1px solid ${hasPhotos ? '#bbf7d0' : '#fde68a'}`,
      }}
    >
      {hasPhotos
        ? 'Фото загружены — вас можно распознать на лекции'
        : 'Фото не загружены — загрузите 3 фото для распознавания на лекциях'}
    </div>
  )
}

const SLOT_LABELS: Record<Slot, string> = {
  left: 'Левая',
  center: 'Фронтальная',
  right: 'Правая',
}

type SavedFace = { url: string; blob: Blob; updatedAt: string | null }

function formatUpdated(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StudentFacesUpload() {
  const auth = useContext(AuthContext)
  const currentUserIsu = (auth?.user?.isu ?? auth?.user?.id ?? '').toString().trim()
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({})
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({})
  const [saved, setSaved] = useState<Partial<Record<Slot, SavedFace>>>({})
  const [savedLoading, setSavedLoading] = useState<boolean>(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number>(0)
  const [biometricConsent, setBiometricConsent] = useState<boolean | null>(null)
  const [consentModalOpen, setConsentModalOpen] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [lightbox, setLightbox] = useState<Slot | null>(null)

  // Хранения objectURL для корректной очистки на анмаунте.
  const previewsRef = useRef(previews)
  const savedRef = useRef(saved)
  useEffect(() => {
    previewsRef.current = previews
  }, [previews])
  useEffect(() => {
    savedRef.current = saved
  }, [saved])

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((url) => url && URL.revokeObjectURL(url))
      Object.values(savedRef.current).forEach((s) => s && URL.revokeObjectURL(s.url))
    }
  }, [])

  useEffect(() => {
    let mounted = true
    getConsents()
      .then((res) => {
        if (!mounted) return
        const active = (res.data?.consents ?? []).some(
          (c) => c.type === 'biometric' && c.active
        )
        setBiometricConsent(active)
      })
      .catch(() => {
        if (mounted) setBiometricConsent(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const loadSavedFaces = async () => {
    setSavedLoading(true)
    try {
      const metaRes = await getMyFacesMeta()
      const meta = metaRes.data
      if (!meta?.has_faces) {
        Object.values(savedRef.current).forEach((s) => s && URL.revokeObjectURL(s.url))
        setSaved({})
        return
      }
      const slots: Slot[] = ['left', 'center', 'right']
      const fetched = await Promise.all(
        slots.map(async (slot) => {
          const res = await getMyFaceBlob(slot)
          const blob = res.data as Blob
          return [slot, { url: URL.createObjectURL(blob), blob, updatedAt: meta.updated_at ?? null }] as const
        })
      )
      // Revoke предыдущие URL перед заменой.
      Object.values(savedRef.current).forEach((s) => s && URL.revokeObjectURL(s.url))
      const next: Partial<Record<Slot, SavedFace>> = {}
      for (const [slot, face] of fetched) next[slot] = face
      setSaved(next)
    } catch (err) {
      console.error('Не удалось загрузить сохранённые фотографии:', err)
    } finally {
      setSavedLoading(false)
    }
  }

  useEffect(() => {
    if (biometricConsent) {
      void loadSavedFaces()
    } else {
      Object.values(savedRef.current).forEach((s) => s && URL.revokeObjectURL(s.url))
      setSaved({})
    }
  }, [biometricConsent])

  const onSelect = (slot: Slot, file: File | null) => {
    if (!file) return

    const maxMb = 8
    if (file.size > maxMb * 1024 * 1024) {
      alert(`Файл слишком большой (максимум ${maxMb} МБ)`)
      return
    }

    const previewUrl = URL.createObjectURL(file)

    if (previews[slot]) URL.revokeObjectURL(previews[slot]!)

    setFiles((prev) => ({ ...prev, [slot]: file }))
    setPreviews((prev) => ({ ...prev, [slot]: previewUrl }))
  }

  const removeSlot = (slot: Slot) => {
    if (previews[slot]) URL.revokeObjectURL(previews[slot]!)
    setFiles((prev) => {
      const copy = { ...prev }
      delete copy[slot]
      return copy
    })
    setPreviews((prev) => {
      const copy = { ...prev }
      delete copy[slot]
      return copy
    })
  }

  const hasNewFiles = useMemo(() => Object.keys(files).length > 0, [files])
  const hasAllSaved = useMemo(
    () => !!(saved.left && saved.center && saved.right),
    [saved]
  )
  const hasAllNewFiles = useMemo(
    () => !!(files.left && files.center && files.right),
    [files]
  )

  // Сохранение возможно если:
  //  - есть хотя бы один новый файл И уже все три сохранены (заменяем недостающие из saved)
  //  - либо есть все три новых файла (первичная загрузка)
  const canSubmit =
    currentUserIsu.length > 0 &&
    !uploading &&
    !consentBusy &&
    ((hasNewFiles && hasAllSaved) || hasAllNewFiles)

  const buildFileForSlot = async (slot: Slot): Promise<File> => {
    if (files[slot]) return files[slot]!
    const s = saved[slot]
    if (!s) throw new Error(`нет данных для слота ${slot}`)
    const type = s.blob.type || 'image/jpeg'
    const ext = type === 'image/png' ? 'png' : 'jpg'
    return new File([s.blob], `${slot}.${ext}`, { type })
  }

  const doUpload = async () => {
    setUploading(true)
    setProgress(0)

    try {
      const [left, center, right] = await Promise.all([
        buildFileForSlot('left'),
        buildFileForSlot('center'),
        buildFileForSlot('right'),
      ])

      await uploadFaces(
        { left, right, center },
        (ev: AxiosProgressEvent) => {
          const loaded = ev.loaded ?? 0
          const total = ev.total ?? 0
          const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
          setProgress(pct)
        }
      )

      Object.values(previews).forEach((url) => url && URL.revokeObjectURL(url))
      setFiles({})
      setPreviews({})
      setProgress(0)
      await Promise.all([auth?.refresh(), loadSavedFaces()])
    } catch (err: any) {
      console.error('Ошибка загрузки фотографий:', err)
      let errorMessage = 'Ошибка загрузки фотографий'
      if (err?.response?.data?.error) errorMessage += `: ${err.response.data.error}`
      else if (err?.message) errorMessage += `: ${err.message}`
      alert(errorMessage)
    } finally {
      setUploading(false)
    }
  }

  const handleUpload = () => {
    if (!currentUserIsu) {
      alert('Не удалось определить ISU текущего пользователя')
      return
    }
    if (!canSubmit) return
    if (biometricConsent) {
      void doUpload()
    } else {
      setConsentModalOpen(true)
    }
  }

  const handleAcceptBiometricConsent = async () => {
    setConsentBusy(true)
    try {
      await giveBiometricConsent()
      setBiometricConsent(true)
      setConsentModalOpen(false)
      await doUpload()
    } catch (err) {
      console.error('Ошибка сохранения согласия:', err)
      alert('Не удалось сохранить согласие на обработку биометрии')
    } finally {
      setConsentBusy(false)
    }
  }

  const handleRevokeConsent = async () => {
    if (
      !window.confirm(
        'Отозвать согласие на обработку биометрии? Загруженные фотографии и биометрические данные будут удалены.'
      )
    ) {
      return
    }
    setConsentBusy(true)
    try {
      await revokeBiometricConsent()
      setBiometricConsent(false)
      Object.values(savedRef.current).forEach((s) => s && URL.revokeObjectURL(s.url))
      setSaved({})
      await auth?.refresh()
      alert('Согласие отозвано, биометрические данные удалены')
    } catch (err) {
      console.error('Ошибка отзыва согласия:', err)
      alert('Не удалось отозвать согласие')
    } finally {
      setConsentBusy(false)
    }
  }

  const submitLabel = hasAllSaved
    ? uploading
      ? 'Сохранение…'
      : 'Сохранить изменения'
    : uploading
      ? 'Загрузка…'
      : 'Загрузить фотографии'

  return (
    <div className="faces-card lowered">
      <div className="faces-header">
        <h3 className="faces-title">Мои фотографии</h3>
        <div className="faces-sub">
          {hasAllSaved
            ? 'Можно заменить любую из фотографий — остальные останутся прежними'
            : 'Загрузите 3 фото: левая, фронтальная, правая'}
          {currentUserIsu ? ` (ISU ${currentUserIsu})` : ''}
        </div>
      </div>

      <div className="faces-body">
        {!currentUserIsu ? (
          <div className="error-text" style={{ marginBottom: 8 }}>
            Сессия не определена. Перезайдите в аккаунт.
          </div>
        ) : null}

        {biometricConsent === true ? (
          <div className="consent-status">
            Согласие на обработку биометрических данных получено.{' '}
            <button
              type="button"
              className="consent-link"
              onClick={handleRevokeConsent}
              disabled={consentBusy}
            >
              Отозвать согласие
            </button>
          </div>
        ) : biometricConsent === false ? (
          <div className="consent-status muted">
            Перед загрузкой фотографий потребуется согласие на обработку
            биометрических персональных данных.
          </div>
        ) : null}

        <div className="slots-row">
          {(['left', 'center', 'right'] as Slot[]).map((slot) => {
            const newFile = files[slot]
            const savedFace = saved[slot]
            const previewUrl = newFile ? previews[slot] : savedFace?.url
            const isNew = !!newFile
            const isSaved = !newFile && !!savedFace

            return (
              <div className="slot" key={slot}>
                <div className="slot-label">{SLOT_LABELS[slot]}</div>
                <div className="slot-thumb">
                  {previewUrl ? (
                    <div className={`thumb ${isNew ? 'thumb-new' : 'thumb-saved'}`}>
                      <img
                        src={previewUrl}
                        alt={slot}
                        className="thumb-img"
                        onClick={() => setLightbox(slot)}
                      />
                      <div className={`thumb-badge ${isNew ? 'badge-new' : 'badge-saved'}`}>
                        {isNew ? 'Новое' : 'Сохранено'}
                      </div>
                      {isNew ? (
                        <button
                          className="thumb-remove"
                          onClick={() => removeSlot(slot)}
                          disabled={uploading}
                          type="button"
                          title="Отменить замену"
                          aria-label="Отменить замену"
                        >
                          ×
                        </button>
                      ) : null}
                      {isSaved ? (
                        <label className="thumb-replace">
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploading}
                            onChange={(e) => onSelect(slot, e.target.files?.[0] || null)}
                            style={{ display: 'none' }}
                          />
                          Заменить
                        </label>
                      ) : null}
                    </div>
                  ) : savedLoading ? (
                    <div className="thumb thumb-skeleton" aria-busy="true" />
                  ) : (
                    <label className="upload-box">
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={(e) => onSelect(slot, e.target.files?.[0] || null)}
                        style={{ display: 'none' }}
                      />
                      <div className="upload-inner">
                        <div className="upload-plus">+</div>
                        <div className="upload-text">{SLOT_LABELS[slot]}</div>
                      </div>
                    </label>
                  )}
                </div>
                {isSaved && savedFace?.updatedAt ? (
                  <div className="slot-meta">Обновлено {formatUpdated(savedFace.updatedAt)}</div>
                ) : null}
              </div>
            )
          })}
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
          <button
            className="btn primary"
            onClick={handleUpload}
            disabled={!canSubmit}
            type="button"
          >
            {submitLabel}
          </button>
          {hasNewFiles && !uploading ? (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                Object.values(previews).forEach((url) => url && URL.revokeObjectURL(url))
                setFiles({})
                setPreviews({})
              }}
            >
              Отменить изменения
            </button>
          ) : null}
        </div>
      </div>

      {lightbox ? (
        <div className="faces-lightbox" onClick={() => setLightbox(null)}>
          <img
            src={(files[lightbox] ? previews[lightbox] : saved[lightbox]?.url) || ''}
            alt={lightbox}
            className="faces-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="faces-lightbox-close"
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      ) : null}

      <ConsentModal
        open={consentModalOpen}
        title={BIOMETRIC_CONSENT_TITLE}
        text={BIOMETRIC_CONSENT_TEXT}
        version={BIOMETRIC_CONSENT_VERSION}
        onClose={() => setConsentModalOpen(false)}
        onAccept={handleAcceptBiometricConsent}
        acceptLabel="Принять и загрузить"
        busy={consentBusy}
      />
    </div>
  )
}



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
  const [gapSeconds, setGapSeconds] = useState<number>(1) // базовый gap = 1s
  const [items, setItems] = useState<VisitItem[]>([])
  const [meta, setMeta] = useState<{ page: number; page_size: number; total: number }>({
    page: 1,
    page_size: 20,
    total: 0,
  })
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [loadingLectures, setLoadingLectures] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoadingSubjects(true)
    setError(null)

    getVisitSubjects()
      .then((res) => {
        const s = (res.data?.subjects ?? []) as SubjectType[]
        if (!mounted) return
        setSubjects(s)
        if (s.length > 0) setSelected((prev) => prev ?? s[0].id)
      })
      .catch((err) => {
        console.error('Не удалось загрузить subjects из /api/visits/lectures/subjects', err)
        setError('Не удалось загрузить предметы посещений')
        setSubjects([])
        setSelected(null)
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

    try {
      const res = await getVisitLecturesBySubject(subjectId, {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        order,
        page: p,
        page_size: pageSize,
        gap_seconds: gapSeconds,
      })

      const data = res.data
      const itemsFromApi = Array.isArray(data?.items) ? (data.items as VisitItem[]) : []
      const metaFromApi = data?.meta ?? { page: p, page_size: pageSize, total: itemsFromApi.length }
      setItems(itemsFromApi)
      setMeta(metaFromApi)
      setPage(metaFromApi.page ?? p)
    } catch (err: any) {
      console.error('Ошибка загрузки лекций (/api/visits/lectures/{subject_id}):', err)
      setError('Не удалось загрузить лекции для выбранного предмета')
      setItems([])
      setMeta({ page: p, page_size: pageSize, total: 0 })
    } finally {
      setLoadingLectures(false)
    }
  }

  useEffect(() => {
    if (selected !== null) loadLectures(selected, { resetPage: true })
  }, [selected, order, pageSize, gapSeconds])

  useEffect(() => {
    if (selected !== null) {
      const t = setTimeout(() => loadLectures(selected, { resetPage: true }), 300)
      return () => clearTimeout(t)
    }
  }, [dateFrom, dateTo, selected])

  const totalPages = useMemo(() => {
    const ps = meta.page_size || pageSize
    return Math.max(1, Math.ceil((meta.total || 0) / ps))
  }, [meta, pageSize])

  const onPrev = () => {
    if (page <= 1 || selected === null) return
    const np = page - 1
    setPage(np)
    // load with new page
    getVisitLecturesBySubject(selected, {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      order,
      page: np,
      page_size: pageSize,
      gap_seconds: gapSeconds,
    })
      .then((res) => {
        const data = res.data
        const itemsFromApi = Array.isArray(data?.items) ? (data.items as VisitItem[]) : []
        const metaFromApi = data?.meta ?? { page: np, page_size: pageSize, total: itemsFromApi.length }
        setItems(itemsFromApi)
        setMeta(metaFromApi)
        setPage(metaFromApi.page ?? np)
      })
      .catch((err) => {
        console.error('Ошибка при перелистывании назад:', err)
        setError('Не удалось загрузить страницу')
      })
  }

  const onNext = () => {
    if (page >= totalPages || selected === null) return
    const np = page + 1
    setPage(np)
    getVisitLecturesBySubject(selected, {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      order,
      page: np,
      page_size: pageSize,
      gap_seconds: gapSeconds,
    })
      .then((res) => {
        const data = res.data
        const itemsFromApi = Array.isArray(data?.items) ? (data.items as VisitItem[]) : []
        const metaFromApi = data?.meta ?? { page: np, page_size: pageSize, total: itemsFromApi.length }
        setItems(itemsFromApi)
        setMeta(metaFromApi)
        setPage(metaFromApi.page ?? np)
      })
      .catch((err) => {
        console.error('Ошибка при перелистывании вперёд:', err)
        setError('Не удалось загрузить страницу')
      })
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
                  const val = e.target.value ? Number(e.target.value) : null
                  setSelected(val)
                  setPage(1)
                }}
                disabled={loadingSubjects}
              >
                <option value="" disabled>
                  {loadingSubjects ? 'Загрузка...' : 'Выберите предмет'}
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
              onChange={(e) => setGapSeconds(e.target.value ? Number(e.target.value) : 1)}
            />
          </div>
        </div>
      </div>

      <div className="visits-body">
        {error && <div className="visits-error">{error}</div>}

        {subjects.length === 0 && !loadingSubjects ? (
          <div className="muted" style={{ padding: 16 }}>
            Нет предметов посещений (нет записей в visits)
          </div>
        ) : (
          <>
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
                    setGapSeconds(1)
                    setPageSize(20)
                    if (selected) loadLectures(selected, { resetPage: true })
                  }}
                >
                  Сбросить
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


export default function StudentsProfile() {
  return (
    <div className="student-profile-page" style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>
      <h2>Профиль студента</h2>
      <PhotoStatusBadge />
      <StudentFacesUpload />
      <StudentVisitsAnalytics />
    </div>
  )
}
