import { useContext, useEffect, useState, useRef } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import type { AxiosProgressEvent } from 'axios'
import { updateProfile, getMyAttendance } from '../services/api'
import api from '../services/api'
import type { User } from '../types'
import './student-profile.css'

type Slot = 'left' | 'center' | 'right'
type FileWithPreview = { file: File; preview: string }

export default function StudentProfile() {
  const { user, setUser } = useContext(AuthContext)
  const [profile, setProfile] = useState<Partial<User>>({})
  const [files, setFiles] = useState<Partial<Record<Slot, FileWithPreview>>>({})
  const [attendance, setAttendance] = useState<{ attended: number; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<Slot, number>>({ left: 0, center: 0, right: 0 })
  const previewsRef = useRef<string[]>([])

  useEffect(() => {
    if (!user) return
    setProfile({ name: user.name, email: user.email, groups: user.groups })
    if (user.photos) {
      // ignore legacy base64 / photos field — we will show uploaded previews only
    }
    ;(async () => {
      try {
        const res = await getMyAttendance()
        setAttendance(res.data)
      } catch {
        setAttendance(null)
      }
    })()
  }, [user])

  useEffect(() => {
    return () => {
      previewsRef.current.forEach(url => URL.revokeObjectURL(url))
      previewsRef.current = []
    }
  }, [])

  const onSelectFile = (slot: Slot, file?: File) => {
    if (!file) return
    const maxMb = 8
    if (file.size > maxMb * 1024 * 1024) {
      alert(`Файл слишком большой (макс ${maxMb} МБ)`)
      return
    }
    const preview = URL.createObjectURL(file)
    previewsRef.current.push(preview)
    setFiles(prev => ({ ...prev, [slot]: { file, preview } }))
  }

  const removeFile = (slot: Slot) => {
    setFiles(prev => {
      const cp = { ...prev }
      if (cp[slot]) {
        try { URL.revokeObjectURL(cp[slot]!.preview) } catch {}
      }
      delete cp[slot]
      return cp
    })
  }

  const save = async () => {
    if (!user) return
    setLoading(true)
    try {
      const payload: Partial<User> = {
        name: profile.name,
        email: profile.email,
        groups: profile.groups,
      }
      await updateProfile(user.id, payload)
      if (Object.keys(files).length > 0) {
        setUploading(true)
        setUploadProgress({ left: 0, center: 0, right: 0 })
        const fd = new FormData()
        if (files.left) fd.append('left_face', files.left.file)
        if (files.right) fd.append('right_face', files.right.file)
        if (files.center) fd.append('center_face', files.center.file)
        await api.post(`/upload/faces/${encodeURIComponent(user.id)}`, fd, {
          headers: { 'Accept': 'application/json' },
          onUploadProgress: (progressEvent: AxiosProgressEvent) => {
            if (!progressEvent.total) return
            const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100)

            const newProg: Record<Slot, number> = { left: 0, center: 0, right: 0 }
            ;(Object.keys(files) as Slot[]).forEach(s => {
              newProg[s] = percent
            })

            setUploadProgress(prev => ({ ...prev, ...newProg }))
          }
          ,
        })
        setUploading(false)
        setFiles({})
      }
      const newUser = { ...(user as User), ...payload }
      if (setUser) setUser(newUser)
      alert('Сохранено')
    } catch (err) {
      console.error(err)
      alert('Ошибка при сохранении / загрузке фотографий')
    } finally {
      setUploadProgress({ left: 0, center: 0, right: 0 })
      setUploading(false)
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="profile-card lowered">
      <div className="profile-header">
        <div>
          <h3 className="profile-title">Профиль</h3>
          <div className="profile-sub">Редактирование личных данных и фотографий лица</div>
        </div>
        <div className="profile-att-summary">
          {attendance ? (
            <div className="att-stats">
              <div className="att-num">{attendance.attended}</div>
              <div className="att-label">из {attendance.total}</div>
            </div>
          ) : (
            <div className="att-muted">Посещаемость недоступна</div>
          )}
        </div>
      </div>

      <div className="profile-body">
        <label className="field-label">ФИО</label>
        <input className="input" value={profile.name || ''} onChange={e => setProfile(s => ({ ...s, name: e.target.value }))} />

        <label className="field-label">Группа</label>
        <input className="input" value={(profile.groups && profile.groups[0]) || ''} onChange={e => setProfile(s => ({ ...s, groups: [e.target.value] }))} />

        <label className="field-label">Фото лица</label>
        <div className="faces-grid">
          <div className="face-slot">
            <div className="slot-label">Левый</div>
            <div className="thumb-wrap">
              {files.left ? (
                <div className="thumb">
                  <img src={files.left.preview} alt="left" className="thumb-img" />
                  <button className="thumb-remove" onClick={() => removeFile('left')}>×</button>
                  {uploading && <div className="thumb-badge small">Загрузка {uploadProgress.left}%</div>}
                </div>
              ) : (
                <label className="upload-box small">
                  <input type="file" accept="image/*" onChange={e => e.target.files && onSelectFile('left', e.target.files[0])} />
                  <div className="upload-inner small">
                    <div className="upload-plus">+</div>
                    <div className="upload-text small">Левая сторона</div>
                  </div>
                </label>
              )}
            </div>
          </div>

          <div className="face-slot">
            <div className="slot-label">Фронтальная</div>
            <div className="thumb-wrap">
              {files.center ? (
                <div className="thumb">
                  <img src={files.center.preview} alt="center" className="thumb-img" />
                  <button className="thumb-remove" onClick={() => removeFile('center')}>×</button>
                  {uploading && <div className="thumb-badge small">Загрузка {uploadProgress.center}%</div>}
                </div>
              ) : (
                <label className="upload-box small">
                  <input type="file" accept="image/*" onChange={e => e.target.files && onSelectFile('center', e.target.files[0])} />
                  <div className="upload-inner small">
                    <div className="upload-plus">+</div>
                    <div className="upload-text small">Фронт</div>
                  </div>
                </label>
              )}
            </div>
          </div>

          <div className="face-slot">
            <div className="slot-label">Правый</div>
            <div className="thumb-wrap">
              {files.right ? (
                <div className="thumb">
                  <img src={files.right.preview} alt="right" className="thumb-img" />
                  <button className="thumb-remove" onClick={() => removeFile('right')}>×</button>
                  {uploading && <div className="thumb-badge small">Загрузка {uploadProgress.right}%</div>}
                </div>
              ) : (
                <label className="upload-box small">
                  <input type="file" accept="image/*" onChange={e => e.target.files && onSelectFile('right', e.target.files[0])} />
                  <div className="upload-inner small">
                    <div className="upload-plus">+</div>
                    <div className="upload-text small">Правая сторона</div>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="actions-row">
          <button className="btn primary" onClick={save} disabled={loading || uploading}>
            {loading || uploading ? 'Загрузка…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
