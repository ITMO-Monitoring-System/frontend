import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register, listDepartments, listGroupsByDepartment } from '../services/api'
import type { Department, Group } from '../types'
import './login.css'

export default function RegisterPage() {
  const [isu, setIsu] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<number | ''>('')
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupCode, setSelectedGroupCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const nav = useNavigate()

  useEffect(() => {
    listDepartments({ limit: 200 })
      .then(res => setDepartments(res.data.departments || []))
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    if (selectedDeptId === '') {
      setGroups([])
      setSelectedGroupCode('')
      return
    }
    listGroupsByDepartment(selectedDeptId)
      .then(res => setGroups(res.data || []))
      .catch(() => setGroups([]))
  }, [selectedDeptId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()

    if (!isu || !firstName || !lastName || !password) {
      alert('Заполните все обязательные поля')
      return
    }
    if (password.length < 6) {
      alert('Пароль должен быть не менее 6 символов')
      return
    }
    if (password !== confirmPassword) {
      alert('Пароли не совпадают')
      return
    }

    setSubmitting(true)
    try {
      await register({
        isu,
        first_name: firstName,
        last_name: lastName,
        patronymic: patronymic || undefined,
        password,
        group_code: selectedGroupCode || undefined,
      })
      alert('Регистрация успешна! Теперь войдите в систему.')
      nav('/login')
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'Ошибка регистрации'
      alert(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <h2 className="login-title">Регистрация</h2>
        <p className="login-sub">Создайте аккаунт для системы учёта посещаемости</p>

        <form onSubmit={submit} className="login-form">
          <input
            className="input"
            placeholder="Номер ISU *"
            value={isu}
            onChange={e => setIsu(e.target.value.replace(/\D/g, ''))}
          />

          <input
            className="input"
            placeholder="Фамилия *"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
          />

          <input
            className="input"
            placeholder="Имя *"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
          />

          <input
            className="input"
            placeholder="Отчество"
            value={patronymic}
            onChange={e => setPatronymic(e.target.value)}
          />

          <input
            className="input"
            type="password"
            placeholder="Пароль (мин. 6 символов) *"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <input
            className="input"
            type="password"
            placeholder="Повторите пароль *"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />

          <select
            className="input"
            value={selectedDeptId}
            onChange={e => setSelectedDeptId(e.target.value ? parseInt(e.target.value, 10) : '')}
          >
            <option value="">-- Направление --</option>
            {departments.map(d => (
              <option key={d.id} value={String(d.id)}>{d.name}</option>
            ))}
          </select>

          {groups.length > 0 && (
            <select
              className="input"
              value={selectedGroupCode}
              onChange={e => setSelectedGroupCode(e.target.value)}
            >
              <option value="">-- Группа --</option>
              {groups.map(g => (
                <option key={g.code} value={g.code}>{g.name || g.code}</option>
              ))}
            </select>
          )}

          <button className="login-submit" disabled={submitting}>
            {submitting ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="login-info">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </div>
    </div>
  )
}
