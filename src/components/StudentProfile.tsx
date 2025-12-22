import { useState } from 'react'
import { uploadFaces } from '../services/api'
import './student-profile.css'

type Slot = 'left' | 'center' | 'right'

export default function StudentProfile() {
  const [isu, setIsu] = useState('')
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({})
  const [loading, setLoading] = useState(false)

  const onFile = (slot: Slot, file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Можно загружать только изображения')
      return
    }
    setFiles(prev => ({ ...prev, [slot]: file }))
  }

  const submit = async () => {
    if (!isu) {
      alert('Введите ИСУ')
      return
    }

    if (!files.left || !files.center || !files.right) {
      alert('Нужно загрузить 3 фотографии')
      return
    }

    setLoading(true)
    try {
      await uploadFaces(isu, {
        left: files.left,
        center: files.center,
        right: files.right,
      })
      alert('Фотографии успешно загружены')
      setFiles({})
    } catch {
      alert('Ошибка при загрузке фотографий')
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="faces-card">
      <h3>Загрузка фотографий лица</h3>

      <label className="label">ИСУ студента</label>
      <input
        className="input"
        value={isu}
        onChange={e => setIsu(e.target.value)}
        placeholder="например 123456"
      />

      <div className="faces-row">
        <FaceInput
          label="Левая"
          file={files.left}
          onChange={f => onFile('left', f)}
        />
        <FaceInput
          label="Фронтальная"
          file={files.center}
          onChange={f => onFile('center', f)}
        />
        <FaceInput
          label="Правая"
          file={files.right}
          onChange={f => onFile('right', f)}
        />
      </div>

      <button
        className="btn primary"
        onClick={submit}
        disabled={loading}
      >
        {loading ? 'Загрузка…' : 'Отправить'}
      </button>
    </div>
  )
}

function FaceInput({
  label,
  file,
  onChange,
}: {
  label: string
  file?: File
  onChange: (file?: File) => void
}) {
  return (
    <label className="face-box">
      <input
        type="file"
        accept="image/*"
        onChange={e => onChange(e.target.files?.[0])}
      />

      {file ? (
        <img src={URL.createObjectURL(file)} className="face-img" />
      ) : (
        <div className="face-placeholder">
          <div className="face-plus">+</div>
          <div className="face-label">{label}</div>
        </div>
      )}
    </label>
  )
}