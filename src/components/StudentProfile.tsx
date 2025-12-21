import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { updateProfile, uploadFace, getMyAttendance } from '../services/api'
import type { User } from '../types'
import './student-profile.css'

export default function StudentProfile() {
  const { user, setUser } = useContext(AuthContext)
  const [profile, setProfile] = useState<Partial<User>>({})
  const [photos, setPhotos] = useState<string[]>([])
  const [attendance, setAttendance] = useState<{ attended: number; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    setProfile({ name: user.name, email: user.email, groups: user.groups })
    if (user.photos) setPhotos(user.photos.slice(0, 3))
    ;(async () => {
      try {
        const res = await getMyAttendance()
        setAttendance(res.data)
      } catch {
        setAttendance(null)
      }
    })()
  }, [user])

  const onFile = (file?: File) => {
    if (!file) return
    if (photos.length >= 3) {
      alert('Можно загрузить до 3 фото')
      return
    }
    const maxMb = 5
    if (file.size > maxMb * 1024 * 1024) {
      alert(`Файл слишком большой (макс ${maxMb} МБ)`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result
      if (typeof res === 'string') {
        setPhotos(prev => [...prev, res])
      }
    }
    reader.onerror = () => {
      alert('Ошибка чтения файла')
    }
    reader.readAsDataURL(file)
  }

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
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
      for (let i = 0; i < photos.slice(0, 3).length; i++) {
        const p = photos[i]
        if (typeof p === 'string' && p.startsWith('data:')) {
          try {
            setUploadingIndex(i)
            await uploadFace(user.id, p)
          } catch {
            console.warn('uploadFace failed for one photo')
          } finally {
            setUploadingIndex(null)
          }
        }
      }
      setUser({ ...(user as User), ...payload, photos })
      alert('Сохранено')
    } catch {
      alert('Ошибка при сохранении')
    } finally {
      setUploadingIndex(null)
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="profile-card">
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

        <label className="field-label">Фото лица (до 3)</label>
        <div className="photos-row">
          {photos.map((p, i) => (
            <div className="thumb" key={i}>
              <img src={p} alt={`face-${i}`} className="thumb-img" />
              <button className="thumb-remove" onClick={() => removePhoto(i)}>×</button>
              {uploadingIndex === i && <div className="thumb-badge">Загрузка…</div>}
            </div>
          ))}

          {photos.length < 3 && (
            <label className="upload-box">
              <input type="file" accept="image/*" onChange={e => e.target.files && onFile(e.target.files[0])} />
              <div className="upload-inner">
                <div className="upload-plus">+</div>
                <div className="upload-text">Загрузить фото</div>
              </div>
            </label>
          )}
        </div>

        <div className="actions-row">
          <button className="btn primary" onClick={save} disabled={loading}>{loading ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}
