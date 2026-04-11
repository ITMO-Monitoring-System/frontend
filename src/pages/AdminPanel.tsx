import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import {
  createUser,
  listDepartments,
  listGroupsByDepartment,
  createSubject,
  deleteSubject,
  setStudentGroup,
  removeStudentGroup,
  listStudentsByGroup,
  listSubjects,
  addRole,
  createDepartment,
  deleteDepartment,
  createGroup,
  deleteGroup,
  listUsers,
  deleteUser,
} from '../services/api'
import './admin.css'

export default function AdminPanel() {
  const auth = useContext(AuthContext)
  const user = auth?.user
  const [departments, setDepartments] = useState<Array<{ id: number; code: string; name?: string; alias?: string }>>([])
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>([])
  const [groups, setGroups] = useState<Array<{ code: string; department_id?: number; name?: string }>>([])
  const [studentsInGroup, setStudentsInGroup] = useState<string[]>([])
  const [usersList, setUsersList] = useState<Array<{ isu: string; first_name: string; last_name: string }>>([])
  const [busy, setBusy] = useState(false)

  // create user
  const [isu, setIsu] = useState('')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('')

  // subject
  const [subjectName, setSubjectName] = useState('')

  // bind student
  const [bindDept, setBindDept] = useState<number | ''>('')
  const [bindGroup, setBindGroup] = useState('')
  const [bindIsu, setBindIsu] = useState('')

  // department form
  const [deptCode, setDeptCode] = useState('')
  const [deptName, setDeptName] = useState('')
  const [deptAlias, setDeptAlias] = useState('')
  const [deptForGroup, setDeptForGroup] = useState<number | ''>('')
  const [groupCode, setGroupCode] = useState('')

  // users filter
  const [usersRoleFilter, setUsersRoleFilter] = useState('')

  const reloadDepartments = () =>
    listDepartments({ limit: 200, offset: 0 })
      .then(r => setDepartments(r.data.departments || []))
      .catch(() => {})

  const reloadSubjects = () =>
    listSubjects({ limit: 200, offset: 0 })
      .then(r => setSubjects(r.data || []))
      .catch(() => {})

  const reloadUsers = (roleFilter?: string) =>
    listUsers({ limit: 200, offset: 0, role: roleFilter || usersRoleFilter || undefined })
      .then(r => setUsersList(r.data.users || []))
      .catch(() => {})

  useEffect(() => {
    reloadDepartments()
    reloadSubjects()
    reloadUsers()
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

  const handleChange = (event: { target: { value: React.SetStateAction<string> } }) => {
    setRole(event.target.value);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isu || !name || !lastName) {
      alert('Заполните данные')
      return
    }
    setBusy(true)
    try {
      await createUser({ isu, name, last_name: lastName, patronymic, password })
      setIsu('')
      setName('')
      setLastName('')
      setPatronymic('')
      setPassword('')
      reloadUsers()
      alert('Пользователь создан')
    } catch (err) {
      console.error(err)
      alert('Ошибка создания пользователя')
    } finally {
      setBusy(false)
    }
  }

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isu || !role) {
      alert('Заполните данные')
      return
    }
    setBusy(true)
    try {
      await addRole({ isu, role })
      setIsu('')
      setRole('')
      alert('Роль добавлена')
    } catch (err) {
      console.error(err)
      alert('Ошибка добавления роли')
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
      setSubjectName('')
      await reloadSubjects()
      alert('Предмет создан')
    } catch (err) {
      console.error(err)
      alert('Ошибка создания предмета')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteSubject = async (id: number, name: string) => {
    if (!confirm(`Удалить предмет "${name}"?`)) return
    setBusy(true)
    try {
      await deleteSubject(id)
      await reloadSubjects()
    } catch (err) {
      console.error(err)
      alert('Ошибка удаления предмета')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deptCode || !deptName) {
      alert('Введите код и название направления')
      return
    }
    setBusy(true)
    try {
      await createDepartment({ code: deptCode, name: deptName, alias: deptAlias || undefined })
      setDeptCode('')
      setDeptName('')
      setDeptAlias('')
      await reloadDepartments()
      alert('Направление создано')
    } catch (err) {
      console.error(err)
      alert('Ошибка создания направления')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteDepartment = async (id: number, code: string) => {
    if (!confirm(`Удалить направление "${code}"?`)) return
    setBusy(true)
    try {
      await deleteDepartment(id)
      await reloadDepartments()
    } catch (err) {
      console.error(err)
      alert('Ошибка удаления направления')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupCode || deptForGroup === '') {
      alert('Выберите направление и введите код группы')
      return
    }
    setBusy(true)
    try {
      await createGroup({ code: groupCode, department_id: Number(deptForGroup) })
      setGroupCode('')
      setDeptForGroup('')
      alert('Группа создана')
    } catch (err) {
      console.error(err)
      alert('Ошибка создания группы')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteGroup = async (code: string) => {
    if (!confirm(`Удалить группу "${code}"?`)) return
    setBusy(true)
    try {
      await deleteGroup(code)
      if (bindDept !== '') {
        const r = await listGroupsByDepartment(Number(bindDept))
        setGroups(r.data || [])
      }
    } catch (err) {
      console.error(err)
      alert('Ошибка удаления группы')
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

  const handleDeleteUser = async (targetIsu: string) => {
    if (!confirm(`Удалить пользователя ${targetIsu}?`)) return
    setBusy(true)
    try {
      await deleteUser(targetIsu)
      await reloadUsers()
    } catch (err) {
      console.error(err)
      alert('Ошибка удаления пользователя')
    } finally {
      setBusy(false)
    }
  }

  if (!user || user.role !== 'admin') return <div className="no-access">Нет доступа</div>
  const adminLabel = user.name ?? user.isu ?? user.id

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h2>Админ-панель</h2>
        <div>Пользователь: {adminLabel}</div>
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
            <label>Пароль</label>
            <input value={password} onChange={e => setPassword(e.target.value)} />
            <div className="actions">
              <button disabled={busy} className="btn primary" type="submit">Создать</button>
            </div>
          </form>
        </section>

        <section className="admin-card">
          <h3>Направления</h3>
          <form onSubmit={handleCreateDepartment} className="admin-form">
            <label>Код</label>
            <input value={deptCode} onChange={e => setDeptCode(e.target.value)} placeholder="09.03.01" />
            <label>Название</label>
            <input value={deptName} onChange={e => setDeptName(e.target.value)} placeholder="Информатика и вычислительная техника" />
            <label>Псевдоним (необязательно)</label>
            <input value={deptAlias} onChange={e => setDeptAlias(e.target.value)} placeholder="ИВТ" />
            <div className="actions">
              <button disabled={busy} className="btn primary" type="submit">Создать направление</button>
            </div>
          </form>

          <h4 className="subtitle">Существующие направления</h4>
          <ul className="list small">
            {departments.map(d => (
              <li key={d.id} className="list-row">
                <span>{d.name || d.code}{d.alias ? ` (${d.alias})` : ''}</span>
                <button disabled={busy} className="btn small danger" onClick={() => handleDeleteDepartment(d.id, d.code)} type="button">Удалить</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-card">
          <h3>Группы</h3>
          <form onSubmit={handleCreateGroup} className="admin-form">
            <label>Направление</label>
            <select value={deptForGroup} onChange={e => setDeptForGroup(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">-- выберите направление --</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name || d.code || d.alias}</option>)}
            </select>
            <label>Код группы</label>
            <input value={groupCode} onChange={e => setGroupCode(e.target.value)} placeholder="P3215" />
            <div className="actions">
              <button disabled={busy} className="btn primary" type="submit">Создать группу</button>
            </div>
          </form>
        </section>

        <section className="admin-card">
          <h3>Предметы</h3>
          <form onSubmit={handleCreateSubject} className="admin-form">
            <label>Название предмета</label>
            <input value={subjectName} onChange={e => setSubjectName(e.target.value)} />
            <div className="actions">
              <button disabled={busy} className="btn primary" type="submit">Создать предмет</button>
            </div>
          </form>

          <h4 className="subtitle">Существующие предметы</h4>
          <ul className="list small">
            {subjects.map(s => (
              <li key={s.id} className="list-row">
                <span>{s.name}</span>
                <button disabled={busy} className="btn small danger" onClick={() => handleDeleteSubject(s.id, s.name)} type="button">Удалить</button>
              </li>
            ))}
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
                {groups.map(g => (
                  <option key={g.code} value={g.code}>{g.name || g.code}</option>
                ))}
              </select>

              {bindGroup && (
                <div style={{ marginTop: 4 }}>
                  <button disabled={busy} className="btn small danger" onClick={() => handleDeleteGroup(bindGroup)} type="button">Удалить группу</button>
                </div>
              )}

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

        <section className="admin-card">
          <h3>Добавить роль</h3>
          <form onSubmit={handleAddRole} className="admin-form">
            <label>ИСУ</label>
            <input value={isu} onChange={e => setIsu(e.target.value)} />
            <label>Роль</label>
            <select value={role} onChange={handleChange}>
              <option value="">-- выберите роль --</option>
              <option value="admin">admin</option>
              <option value="teacher">teacher</option>
              <option value="student">student</option>
            </select>
            <div className="actions">
              <button disabled={busy} className="btn primary" type="submit">Добавить роль</button>
            </div>
          </form>
        </section>

        <section className="admin-card">
          <h3>Пользователи</h3>
          <div className="admin-form" style={{ marginBottom: 12 }}>
            <label>Фильтр по роли</label>
            <select value={usersRoleFilter} onChange={e => {
              setUsersRoleFilter(e.target.value)
              reloadUsers(e.target.value)
            }}>
              <option value="">Все</option>
              <option value="admin">admin</option>
              <option value="teacher">teacher</option>
              <option value="student">student</option>
            </select>
          </div>
          <ul className="list small">
            {usersList.map(u => (
              <li key={u.isu} className="list-row">
                <span>{u.last_name} {u.first_name} <span className="muted">({u.isu})</span></span>
                <button disabled={busy} className="btn small danger" onClick={() => handleDeleteUser(u.isu)} type="button">Удалить</button>
              </li>
            ))}
            {usersList.length === 0 && <li className="muted">Нет пользователей</li>}
          </ul>
        </section>
      </main>
    </div>
  )
}
