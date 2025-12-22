import React, { useState, useContext } from 'react'
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

    if (email === 'admin' && password === 'admin') {
      login('admin-token')
      setUser({ id: 'admin', name: 'Admin', email: 'admin', role: 'admin' })
      nav('/')
      return
    }

    if (email === 'teacher' && password === 'teacher') {
      login('teacher-token')
      setUser({ id: 'teacher', name: 'Teacher', email: 'teacher', role: 'teacher' })
      nav('/')
      return
    }

    try {
      const res = await apiLogin(email, password)
      login(res.data.token)
      const meRes = await apiMe()
      setUser(meRes.data)
      nav('/')
    } catch {
      alert('Login failed')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2 className="login-title">Вход</h2>
        <p className="login-sub">Система учёта посещаемости</p>

        <form onSubmit={submit} className="login-form">
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <input
            className="input"
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <button className="login-submit">Войти</button>
        </form>

        <div className="login-info">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </div>

        <div className="login-info">
          Преподаватель (тест): <b>admin / admin</b>
        </div>
      </div>
    </div>
  )
}
