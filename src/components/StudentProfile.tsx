import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import type { AxiosProgressEvent } from 'axios'
import './student-faces.css'

type Slot = 'left' | 'center' | 'right'
type FileWithPreview = { file: File; preview: string }

export default function StudentFacesUpload() {
  const [isu, setIsu] = useState('')
  const [files, setFiles] = useState<Partial<Record<Slot, FileWithPreview>>>({})
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number>(0)
  const previewsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      previewsRef.current.forEach(u => URL.revokeObjectURL(u))
      previewsRef.current = []
    }
  }, [])

  const onSelect = (slot: Slot, f?: File) => {
    if (!f) return
    const maxMb = 8
    if (f.size > maxMb * 1024 * 1024) {
      alert(`Файл слишком большой (макс ${maxMb} МБ)`)
      return
    }
    const p = URL.createObjectURL(f)
    previewsRef.current.push(p)
    setFiles(prev => ({ ...prev, [slot]: { file: f, preview: p } }))
  }

  const removeSlot = (slot: Slot) => {
    setFiles(prev => {
      const cp = { ...prev }
      if (cp[slot]) {
        try { URL.revokeObjectURL(cp[slot]!.preview) } catch {}
      }
      delete cp[slot]
      return cp
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
    const fd = new FormData()
    fd.append('left_face', files.left.file)
    fd.append('center_face', files.center.file)
    fd.append('right_face', files.right.file)
    setUploading(true)
    setProgress(0)
    try {
      await api.post(`/upload/faces/${encodeURIComponent(isu)}`, fd, {
        headers: { Accept: 'application/json' },
        onUploadProgress: (ev: AxiosProgressEvent) => {
          const loaded = ev.loaded ?? 0
          const total = ev.total ?? 0
          const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
          setProgress(pct)
        },
      })
      alert('Фотографии успешно загружены')
      setFiles({})
      setProgress(0)
      setIsu('')
    } catch (err) {
      console.error(err)
      alert('Ошибка загрузки фотографий')
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
          onChange={e => setIsu(e.target.value.replace(/\D/g, ''))}
          placeholder="Введите ISU (только цифры)"
        />

        <div className="slots-row">
          <div className="slot">
            <div className="slot-label">Левая</div>
            <div className="slot-thumb">
              {files.left ? (
                <div className="thumb">
                  <img src={files.left.preview} alt="left" className="thumb-img" />
                  <button className="thumb-remove" onClick={() => removeSlot('left')}>×</button>
                </div>
              ) : (
                <label className="upload-box">
                  <input type="file" accept="image/*" onChange={e => e.target.files && onSelect('left', e.target.files[0])} />
                  <div className="upload-inner">
                    <div className="upload-plus">+</div>
                    <div className="upload-text">Левая</div>
                  </div>
                </label>
              )}
            </div>
          </div>

          <div className="slot">
            <div className="slot-label">Фронтальная</div>
            <div className="slot-thumb">
              {files.center ? (
                <div className="thumb">
                  <img src={files.center.preview} alt="center" className="thumb-img" />
                  <button className="thumb-remove" onClick={() => removeSlot('center')}>×</button>
                </div>
              ) : (
                <label className="upload-box">
                  <input type="file" accept="image/*" onChange={e => e.target.files && onSelect('center', e.target.files[0])} />
                  <div className="upload-inner">
                    <div className="upload-plus">+</div>
                    <div className="upload-text">Фронт</div>
                  </div>
                </label>
              )}
            </div>
          </div>

          <div className="slot">
            <div className="slot-label">Правая</div>
            <div className="slot-thumb">
              {files.right ? (
                <div className="thumb">
                  <img src={files.right.preview} alt="right" className="thumb-img" />
                  <button className="thumb-remove" onClick={() => removeSlot('right')}>×</button>
                </div>
              ) : (
                <label className="upload-box">
                  <input type="file" accept="image/*" onChange={e => e.target.files && onSelect('right', e.target.files[0])} />
                  <div className="upload-inner">
                    <div className="upload-plus">+</div>
                    <div className="upload-text">Правая</div>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-label">{uploading ? `${progress}%` : ''}</div>
        </div>

        <div className="actions-row">
          <button className="btn primary" onClick={handleUpload} disabled={!canUploadAll() || uploading}>
            {uploading ? 'Загрузка…' : 'Загрузить фотографии'}
          </button>
        </div>
      </div>
    </div>
  )
}
