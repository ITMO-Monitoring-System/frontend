import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import {
  createUser,
  listDepartments,
  listGroupsByDepartment,
  createSubject,
  setStudentGroup,  // Изменили название функции
  removeStudentGroup,
  listStudentsByGroup,
  listSubjects,
} from '../services/api'
import './admin.css'

export default function AdminPanel() {
  const { user } = useContext(AuthContext)
  const [departments, setDepartments] = useState<Array<{ id: number; code: string; name?: string; alias?: string }>>([])
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>([])
  const [groups, setGroups] = useState<Array<{ code: string; department_id?: number; name?: string }>>([])
  const [studentsInGroup, setStudentsInGroup] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const [isu, setIsu] = useState('')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [patronymic, setPatronymic] = useState('')

  const [subjectName, setSubjectName] = useState('')

  const [bindDept, setBindDept] = useState<number | ''>('')
  const [bindGroup, setBindGroup] = useState('')
  const [bindIsu, setBindIsu] = useState('')

  useEffect(() => {
    listDepartments({ limit: 200, offset: 0 })
      .then(r => setDepartments(r.data.departments || []))
      .catch(() => {})
    listSubjects({ limit: 200, offset: 0 })
      .then(r => setSubjects(r.data || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (bindDept === '') {
      setGroups([])
      setBindGroup('')
      return
    }
    setGroups([])
    listGroupsByDepartment(Number(bindDept))
      .then(r => setGroups(r.data || []))
      .catch(() => setGroups([]))
  }, [bindDept])

  useEffect(() => {
    if (!bindGroup) {
      setStudentsInGroup([])
      return
    }
    listStudentsByGroup(bindGroup)
      .then(r => setStudentsInGroup(r.data.user_ids || []))
      .catch(() => setStudentsInGroup([]))
  }, [bindGroup])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isu || !name || !lastName) {
      alert('Заполните ИСУ, имя и фамилию')
      return
    }
    setBusy(true)
    try {
      await createUser({ isu, last_name: lastName, name, patronymic })
      setIsu('')
      setName('')
      setLastName('')
      setPatronymic('')
      alert('Пользователь создан')
    } catch (err) {
      console.error(err)
      alert('Ошибка создания пользователя')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subjectName) {
      alert('Введите название предмета')
      return
    }
    setBusy(true)
    try {
      await createSubject({ name: subjectName })
      const r = await listSubjects({ limit: 200, offset: 0 })
      setSubjects(r.data || [])
      setSubjectName('')
      alert('Предмет создан')
    } catch (err) {
      console.error(err)
      alert('Ошибка создания предмета')
    } finally {
      setBusy(false)
    }
  }

  const handleBindStudent = async () => {
    if (!bindGroup || !bindIsu) {
      alert('Выберите группу и введите ИСУ')
      return
    }
    setBusy(true)
    try {
      // Используем setStudentGroup с правильным форматом тела
      await setStudentGroup(bindIsu, {
        group_code: bindGroup,
        user_id: bindIsu
      })
      const r = await listStudentsByGroup(bindGroup)
      setStudentsInGroup(r.data.user_ids || [])
      setBindIsu('')
      alert('Студент привязан к группе')
    } catch (err) {
      console.error(err)
      alert('Ошибка привязки студента')
    } finally {
      setBusy(false)
    }
  }

  const handleUnbindStudent = async (targetIsu?: string) => {
    const isuToRemove = targetIsu ?? bindIsu
    if (!isuToRemove) {
      alert('Введите ИСУ или выберите студента')
      return
    }
    setBusy(true)
    try {
      // Просто удаляем привязку студента к группе
      await removeStudentGroup(isuToRemove)
      if (bindGroup) {
        const r = await listStudentsByGroup(bindGroup)
        setStudentsInGroup(r.data.user_ids || [])
      }
      setBindIsu('')
      alert('Студент отвязан от группы')
    } catch (err) {
      console.error(err)
      alert('Ошибка отвязки студента')
    } finally {
      setBusy(false)
    }
  }

  if (!user || user.role !== 'admin') return <div className="no-access">Нет доступа</div>

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h2>Админ-панель</h2>
        <div>Пользователь: {user.name}</div>
      </header>

      <main className="admin-main">
        <section className="admin-card">
          <h3>Создать пользователя</h3>
          <form onSubmit={handleCreateUser} className="admin-form">
            <label>ИСУ</label>
            <input value={isu} onChange={e => setIsu(e.target.value.replace(/\D/g, ''))} />
            <label>Имя</label>
            <input value={name} onChange={e => setName(e.target.value)} />
            <label>Фамилия</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} />
            <label>Отчество</label>
            <input value={patronymic} onChange={e => setPatronymic(e.target.value)} />
            <div className="actions">
              <button disabled={busy} className="btn primary" type="submit">Создать</button>
            </div>
          </form>
        </section>

        <section className="admin-card">
          <h3>Создать предмет</h3>
          <form onSubmit={handleCreateSubject} className="admin-form">
            <label>Название предмета</label>
            <input value={subjectName} onChange={e => setSubjectName(e.target.value)} />
            <div className="actions">
              <button disabled={busy} className="btn primary" type="submit">Создать предмет</button>
            </div>
          </form>

          <h4 className="subtitle">Существующие предметы</h4>
          <ul className="list small">
            {subjects.map(s => <li key={s.id}>{s.name}</li>)}
          </ul>
        </section>

        <section className="admin-card">
          <h3>Привязка студентов к группам</h3>
          <div className="bind-row">
            <div className="bind-col">
              <label>Направление</label>
              <select value={bindDept} onChange={e => setBindDept(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">-- выберите направление --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name || d.code || d.alias || d.id}</option>)}
              </select>

              <label style={{ marginTop: 8 }}>Группа</label>
              <select value={bindGroup} onChange={e => setBindGroup(e.target.value)}>
                <option value="">-- выберите группу --</option>
                {groups.map(g => <option key={g.code} value={g.code}>{g.name || g.code}</option>)}
              </select>

              <label style={{ marginTop: 8 }}>ИСУ (число)</label>
              <input value={bindIsu} onChange={e => setBindIsu(e.target.value.replace(/\D/g, ''))} />

              <div className="actions">
                <button disabled={busy} className="btn primary" onClick={handleBindStudent} type="button">Привязать</button>
                <button disabled={busy} className="btn danger" onClick={() => handleUnbindStudent()} type="button">Отвязать по ИСУ</button>
              </div>
            </div>

            <div className="bind-col">
              <h4 className="subtitle">Студенты в группе</h4>
              <div className="students-list">
                {bindGroup ? (
                  studentsInGroup.length ? (
                    studentsInGroup.map(s => (
                      <div key={s} className="student-row">
                        <div className="student-isu">{s}</div>
                        <div>
                          <button disabled={busy} className="btn small" onClick={() => handleUnbindStudent(s)} type="button">Удалить</button>
                        </div>
                      </div>
                    ))
                  ) : <div className="muted">Список пуст</div>
                ) : <div className="muted">Выберите группу</div>}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}