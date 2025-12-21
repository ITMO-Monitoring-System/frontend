import React, { useEffect, useState, useContext } from 'react'
import { createUser, listGroups } from '../services/api'
import { AuthContext } from '../contexts/AuthContext'
import './admin.css'

export default function AdminPanel() {
  const { user } = useContext(AuthContext)
  const [isu, setIsu] = useState('')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [role, setRole] = useState('student')
  const [group, setGroup] = useState('')
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listGroups().then(r => setGroups(r.data)).catch(() => {})
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isu || !name || !lastName) {
      alert('Заполните ИСУ, имя и фамилию')
      return
    }
    setBusy(true)
    try {
      await createUser({ isu, last_name: lastName, name, patronymic, role })
      if (group) {
        try {
          await fetch(`/api/groups/${encodeURIComponent(group)}/addUser`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isu }),
          })
        } catch {}
      }
      setIsu(''); setName(''); setLastName(''); setPatronymic(''); setRole('student'); setGroup('')
      alert('Пользователь создан')
    } catch (err) {
      console.error(err)
      alert('Ошибка создания пользователя')
    } finally {
      setBusy(false)
    }
  }

  if (!user || user.role !== 'admin') return <div style={{ padding: 20 }}>Нет доступа</div>

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h2>Админ-панель</h2>
        <div>Пользователь: {user.name}</div>
      </header>

      <main className="admin-main">
        <section className="admin-card">
          <h3>Создать пользователя</h3>
          <form onSubmit={submit} className="admin-form">
            <label>ИСУ</label>
            <input value={isu} onChange={e => setIsu(e.target.value)} />
            <label>Имя</label>
            <input value={name} onChange={e => setName(e.target.value)} />
            <label>Фамилия</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} />
            <label>Отчество</label>
            <input value={patronymic} onChange={e => setPatronymic(e.target.value)} />
            <label>Роль</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="student">student</option>
              <option value="teacher">teacher</option>
              <option value="admin">admin</option>
            </select>
            <label>Группа (опционально)</label>
            <select value={group} onChange={e => setGroup(e.target.value)}>
              <option value="">-- не добавлять --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div style={{ marginTop: 12 }}>
              <button disabled={busy} className="btn primary" type="submit">Создать</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
