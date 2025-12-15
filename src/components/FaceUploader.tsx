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
    <div className="p-4 border rounded">
      <h3 className="font-semibold mb-2">Загрузить фото лица (до 3)</h3>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files && onFile(e.target.files[0])}
      />
      <div className="flex gap-2 mt-2">
        {files.slice(0, 3).map((src, i) => (
          <img key={i} src={src} className="w-20 h-20 object-cover rounded" />
        ))}
      </div>
      <button
        onClick={submit}
        disabled={uploading || files.length === 0}
        className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
      >
        Сохранить
      </button>
    </div>
  );
}
