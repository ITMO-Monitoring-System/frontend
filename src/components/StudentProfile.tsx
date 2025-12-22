import { useEffect, useState } from 'react'
import { uploadFaces } from '../services/api'
import type { AxiosProgressEvent } from 'axios'
import './student-profile.css'

type Slot = 'left' | 'center' | 'right'

export default function StudentFacesUpload() {
  const [isu, setIsu] = useState('')
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({})
  const [previews, setPreviews] = useState<Partial<Record<Slot, string>>>({})
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number>(0)

  // Очистка URL preview при размонтировании
  useEffect(() => {
    return () => {
      Object.values(previews).forEach(url => {
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

    // Создаем preview
    const previewUrl = URL.createObjectURL(file)
    
    // Очищаем старый preview, если был
    if (previews[slot]) {
      URL.revokeObjectURL(previews[slot]!)
    }

    setFiles(prev => ({ ...prev, [slot]: file }))
    setPreviews(prev => ({ ...prev, [slot]: previewUrl }))
  }

  const removeSlot = (slot: Slot) => {
    if (previews[slot]) {
      URL.revokeObjectURL(previews[slot]!)
    }
    
    setFiles(prev => {
      const newFiles = { ...prev }
      delete newFiles[slot]
      return newFiles
    })
    
    setPreviews(prev => {
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
        center: files.center
      }, (ev: AxiosProgressEvent) => {
        const loaded = ev.loaded ?? 0
        const total = ev.total ?? 0
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
        setProgress(pct)
      })

      alert('Фотографии успешно загружены')
      
      // Сбрасываем состояние
      Object.values(previews).forEach(url => {
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
          onChange={e => setIsu(e.target.value.replace(/\D/g, ''))}
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
                    <img 
                      src={previews[slot]} 
                      alt={slot}
                      className="thumb-img" 
                    />
                    <button 
                      className="thumb-remove" 
                      onClick={() => removeSlot(slot)}
                      disabled={uploading}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="upload-box">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={e => onSelect(slot, e.target.files?.[0] || null)}
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
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }} 
              />
            </div>
            <div className="progress-label">{progress}%</div>
          </div>
        )}

        <div className="actions-row">
          <button 
            className="btn primary" 
            onClick={handleUpload} 
            disabled={!canUploadAll() || uploading}
          >
            {uploading ? 'Загрузка…' : 'Загрузить фотографии'}
          </button>
        </div>
      </div>
    </div>
  )
}