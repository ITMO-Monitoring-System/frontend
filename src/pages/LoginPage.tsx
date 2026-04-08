import React, { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { login as apiLogin } from '../services/api'
import { AuthContext } from '../contexts/AuthContext'
import './login.css'

export default function LoginPage() {
  const [isu, setIsu] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [submitting, setSubmitting] = useState(false)
  const auth = useContext(AuthContext)
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) return

    setSubmitting(true)

    try {
      const res = await apiLogin(isu, password, role)
      const token = res.data.access_token
      if (!token) {
        alert('Не получили токен от сервера')
        return
      }
      await auth.login(token)
      nav('/')
    } catch (err: any) {
      const message = err?.response?.data?.error ?? err?.response?.data?.message ?? 'Login failed'
      alert(message)
    } finally {
      setSubmitting(false)
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
            placeholder="Номер ISU"
            value={isu}
            onChange={e => setIsu(e.target.value.replace(/\D/g, ''))}
          />

          <input
            className="input"
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="student">student</option>
            <option value="teacher">teacher</option>
            <option value="admin">admin</option>
          </select>

          <button className="login-submit" disabled={submitting}>
            {submitting ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
