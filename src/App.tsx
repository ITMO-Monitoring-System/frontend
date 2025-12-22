import { useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, AuthContext } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import AdminPanel from './pages/AdminPanel'
import LectureView from './components/LectureView'
import StudentProfile from './components/StudentProfile'
import RegisterPage from './pages/RegisterPage'

function RequireAuth({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { user } = useContext(AuthContext)
  if (!user) return <Navigate to="/login" />
  if (roles && !roles.includes(user.role || '')) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/student" element={<StudentProfile />} />
          <Route path="/teacher" element={<LectureView />} />
          <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminPanel /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><MainRouter /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function MainRouter() {
  const { user } = useContext(AuthContext)
  if (!user) return <Navigate to="/login" />
  if (user.role === 'teacher') return <LectureView />
  if (user.role === 'student') return (
    <div style={{ padding: 20 }}>
      <StudentProfile />
    </div>
  )
  return <div style={{ padding: 20 }}>Нет доступной роли</div>
}
