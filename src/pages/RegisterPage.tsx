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
  const [departmentsLoading, setDepartmentsLoading] = useState(true)
  const [departmentsError, setDepartmentsError] = useState('')
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const nav = useNavigate()

  useEffect(() => {
    setDepartmentsLoading(true)
    setDepartmentsError('')
    listDepartments({ limit: 200, offset: 0 })
      .then(res => setDepartments(res.data.departments || []))
      .catch(() => {
        setDepartments([])
        setDepartmentsError('Не удалось загрузить направления')
      })
      .finally(() => setDepartmentsLoading(false))
  }, [])

  useEffect(() => {
    if (selectedDeptId === '') {
      setGroups([])
      setSelectedGroupCode('')
      setGroupsError('')
      setGroupsLoading(false)
      return
    }
    setGroupsLoading(true)
    setGroupsError('')
    listGroupsByDepartment(selectedDeptId)
      .then(res => setGroups(res.data || []))
      .catch(() => {
        setGroups([])
        setGroupsError('Не удалось загрузить группы для выбранного направления')
      })
      .finally(() => setGroupsLoading(false))
  }, [selectedDeptId])

  const getDepartmentLabel = (department: Department) =>
    department.name?.trim() || department.code?.trim() || department.alias?.trim() || String(department.id)

  const getGroupLabel = (group: Group) => group.name?.trim() || group.code

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
            disabled={departmentsLoading}
            onChange={e => setSelectedDeptId(e.target.value ? parseInt(e.target.value, 10) : '')}
          >
            <option value="">
              {departmentsLoading ? '-- Загрузка направлений --' : '-- Направление --'}
            </option>
            {departments.map(d => (
              <option key={d.id} value={String(d.id)}>{getDepartmentLabel(d)}</option>
            ))}
          </select>
          {departmentsError && <div className="login-info">{departmentsError}</div>}

          <select
            className="input"
            value={selectedGroupCode}
            disabled={selectedDeptId === '' || groupsLoading || groups.length === 0}
            onChange={e => setSelectedGroupCode(e.target.value)}
          >
            <option value="">
              {selectedDeptId === ''
                ? '-- Сначала выберите направление --'
                : groupsLoading
                  ? '-- Загрузка групп --'
                  : groups.length === 0
                    ? '-- Нет доступных групп --'
                    : '-- Группа --'}
            </option>
            {groups.map(g => (
              <option key={g.code} value={g.code}>{getGroupLabel(g)}</option>
            ))}
          </select>
          {groupsError && <div className="login-info">{groupsError}</div>}

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
