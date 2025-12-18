import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { updateProfile, uploadFace, getMyAttendance } from '../services/api'
import type { User } from '../types'
import './student-profile.css'

export default function StudentProfile() {
  const { user, setUser } = useContext(AuthContext)

  const [profile, setProfile] = useState<Partial<User>>({})
  const [photos, setPhotos] = useState<string[]>([])
  const [attendance, setAttendance] = useState<{
    attended: number
    total: number
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return

    setProfile({
      name: user.name,
      email: user.email,
      groups: user.groups,
    })

    if (user.photos) setPhotos(user.photos.slice(0, 3))

    ;(async () => {
      try {
        const res = await getMyAttendance()
        setAttendance(res.data)
      } catch {
        console.warn('Attendance fetch failed')
      }
    })()
  }, [user])

  const onFile = (file?: File) => {
    if (!file) return
    if (photos.length >= 3) {
      alert('Можно загрузить до 3 фото')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotos(prev => [...prev, reader.result as string])
      }
    }
    reader.onerror = () => alert('Ошибка чтения файла')
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

      for (const p of photos) {
        if (p.startsWith('data:')) {
          try {
            await uploadFace(user.id, p)
          } catch {
            console.warn('uploadFace failed for one photo')
          }
        }
      }

      setUser((prev: User) => ({ ...(prev as User), ...payload, photos }))
      alert('Сохранено')
    } catch {
      alert('Ошибка при сохранении')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="profile-card">
      <h3>Профиль студента</h3>

      <div className="profile-field">
        <label>ФИО</label>
        <input
          className="input"
          value={profile.name || ''}
          onChange={e =>
            setProfile(s => ({ ...s, name: e.target.value }))
          }
        />
      </div>

      <div className="profile-field">
        <label>Группа</label>
        <input
          className="input"
          value={(profile.groups && profile.groups[0]) || ''}
          onChange={e =>
            setProfile(s => ({ ...s, groups: [e.target.value] }))
          }
        />
      </div>

      <div className="profile-field">
        <label>Фото (до 3)</label>
        <div className="profile-photos">
          {photos.map((p, i) => (
            <div key={i} className="photo-remove">
              <img src={p} alt={`face-${i}`} />
              <button onClick={() => removePhoto(i)}>×</button>
            </div>
          ))}

          {photos.length < 3 && (
            <label className="photo-upload">
              +
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={e =>
                  e.target.files && onFile(e.target.files[0])
                }
              />
            </label>
          )}
        </div>
      </div>

      <div className="profile-actions">
        <button
          className="btn primary"
          onClick={save}
          disabled={loading}
        >
          {loading ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>

      <div className="profile-attendance">
        <h4>Посещаемость</h4>
        {attendance ? (
          <div>
            <strong>{attendance.attended}</strong> из{' '}
            {attendance.total} лекций
          </div>
        ) : (
          <div className="muted">Данные отсутствуют</div>
        )}
      </div>
    </div>
  )
}
