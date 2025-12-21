import React, { useContext, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login as apiLogin, me as apiMe } from '../services/api'
import { AuthContext } from '../contexts/AuthContext'
import './login.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, setUser } = useContext(AuthContext)
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()

    if (email === 'teacher' && password === 'teacher') {
      const fakeToken = 'teacher-token'
      login(fakeToken)
      setUser({ id: 'teacher', name: 'Преподаватель', email: 'teacher', role: 'teacher' })
      nav('/')
      return
    }

    if (email === 'admin' && password === 'admin') {
      const fakeToken = 'admin-token'
      login(fakeToken)
      setUser({ id: 'admin', name: 'Администратор', email: 'admin', role: 'admin' })
      nav('/admin')
      return
    }

    if (email === 'student' && password === 'student') {
      const fakeToken = 'student-token'
      login(fakeToken)
      setUser({ id: 'student', name: 'Студент', email: 'student', role: 'student' })
      nav('/')
      return
    }

    try {
      const res = await apiLogin(email, password)
      const token = res.data.token
      if (!token) throw new Error('No token')
      login(token)
      try {
        const meRes = await apiMe()
        setUser(meRes.data)
      } catch {
        setUser({ id: email, name: email, email, role: 'student' })
      }
      nav('/')
    } catch (err) {
      alert('Login failed')
      console.error(err)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2 className="login-title">Вход</h2>
        <form onSubmit={submit} className="login-form">
          <input className="input" placeholder="Логин" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="input" placeholder="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <div className="login-form-row">
            <button className="btn primary" type="submit">Войти</button>
          </div>
        </form>
        <div className="login-info">
          Тестовые аккаунты: преподаватель teacher/teacher, админ admin/admin, студент student/student
        </div>
        <div style={{ marginTop: 8 }}>
          <Link to="/register">Зарегистрироваться</Link>
        </div>
      </div>
    </div>
  )
}
