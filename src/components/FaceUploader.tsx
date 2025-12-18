import { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { uploadFace } from '../services/api';

export default function FaceUploader() {
  const { user } = useContext(AuthContext);
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const onFile = (f: File | null) => {
    if (!f) return;
    if (files.length >= 3) return alert('Можно загрузить не более 3 фото');
    const reader = new FileReader();
    reader.onload = () => setFiles((prev) => [...prev, String(reader.result)]);
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!user) return;
    try {
      setUploading(true);
      for (const f of files.slice(0, 3)) {
        await uploadFace(user.id, f);
      }
      alert('Uploaded');
      setFiles([]);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      alert('Upload error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="face-uploader">
      <h3>Загрузить фото лица</h3>

      <label className="file-input">
        Выбрать файл
        <input
          type="file"
          accept="image/*"
          onChange={e => e.target.files && onFile(e.target.files[0])}
        />
      </label>

      <div className="preview">
        {files.map((src, i) => (
          <img key={i} src={src} alt={`face-${i}`} />
        ))}
      </div>

      <button
        onClick={submit}
        disabled={uploading || files.length === 0}
      >
        {uploading ? 'Загрузка…' : 'Сохранить'}
      </button>
    </div>
  )
}