import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import LectureView from '../components/LectureView'
import StudentProfile from '../components/StudentProfile'
import './dashboard.css'

export default function Dashboard() {
  const { user } = useContext(AuthContext)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Face Attendance</h1>
        </div>
        <div className="app-user">
          {user?.name} — {user?.role}
        </div>
      </header>

      <main className="app-main">
        <section className="app-content">
          {user?.role === 'teacher' ? (
            <LectureView />
          ) : (
            <div className="card">
              Добро пожаловать в личный кабинет
            </div>
          )}
        </section>

        <aside className="app-sidebar">
          {user?.role === 'student' && <StudentProfile />}
          {user?.role === 'teacher' && (
            <div className="card">
              Управление лекцией
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
