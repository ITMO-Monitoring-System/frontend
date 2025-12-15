import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import LectureView from '../components/LectureView';
import FaceUploader from '../components/FaceUploader';
import AdminPanel from '../components/AdminPanel';

export default function Dashboard() {
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="p-4">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl">Face Attendance</h1>
        <div className="flex gap-4 items-center">
          <div>
            {user?.name} — {user?.role}
          </div>
          <button onClick={logout} className="px-2 py-1 border rounded">
            Выйти
          </button>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-4">
        <section className="col-span-8">
          <LectureView />
        </section>

        <aside className="col-span-4 space-y-4">
          {user?.role === 'student' && <FaceUploader />}
          {user?.role === 'admin' && <AdminPanel />}
        </aside>
      </main>
    </div>
  );
}
