import React, { useState, useContext } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register as apiRegister, login as apiLogin, me as apiMe } from '../services/api'
import { AuthContext } from '../contexts/AuthContext'
import './register.css'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, setUser } = useContext(AuthContext)
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      await apiRegister(email, password)

      const res = await apiLogin(email, password)
      login(res.data.token)

      const meRes = await apiMe()
      setUser(meRes.data)

      nav('/')
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Registration failed')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-title">Регистрация студента</h2>
        <p className="auth-subtitle">Создайте аккаунт для учёта посещаемости</p>

        <form onSubmit={submit} className="auth-form">
          <input
            className="auth-input"
            placeholder="Номер ису"
            value={email}
            onChange={e => setEmail(e.target.value.replace(/\D/g, ''))}
            required
          />

          <input
            className="auth-input"
            placeholder="Пароль"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <button className="auth-button" disabled={loading}>
            {loading ? 'Загрузка…' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </div>
    </div>
  )
}
