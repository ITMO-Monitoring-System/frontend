import React, { useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, AuthContext } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import LectureView from './components/LectureView'
import StudentProfile from './components/StudentProfile'
import HeaderBar from './components/HeaderBar'
import './components/header-bar.css'
import AdminPanel from './pages/AdminPanel'

const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const ctx = useContext(AuthContext)
  if (!ctx) return <div>Loading...</div>
  const { user, loading } = ctx
  if (loading) return <div>Загрузка...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function Root() {
  const { user } = useContext(AuthContext)
  if (!user) return null
  if (user.role === 'teacher') return <LectureView />
  if (user.role === 'admin') return <AdminPanel />
  return <StudentProfile />
}

export default function App() {
  return (
    <AuthProvider>
      <HeaderBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Root />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
