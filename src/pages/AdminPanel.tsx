import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import * as api from '../services/api';
import type { Department, Group, Subject } from '../types';
import { apiError } from '../utils/apiError';
import './admin.css';

type Section = 'users' | 'departments' | 'groups' | 'subjects';
type AdminUser = { isu: string; first_name: string; last_name: string; roles: string[] };
const sections: { id: Section; title: string; description: string; icon: string }[] = [
  { id: 'users', title: 'Пользователи', description: 'Учётные записи, роли и доступ', icon: '01' },
  {
    id: 'departments',
    title: 'Направления',
    description: 'Коды, названия и псевдонимы',
    icon: '02',
  },
  { id: 'groups', title: 'Группы', description: 'Учебные группы и состав студентов', icon: '03' },
  { id: 'subjects', title: 'Предметы', description: 'Каталог учебных дисциплин', icon: '04' },
];
const roleNames: Record<string, string> = {
  admin: 'Администратор',
  teacher: 'Преподаватель',
  student: 'Студент',
};

function useResource<T>(loader: () => Promise<T>, refresh: number, initial: T) {
  const [state, setState] = useState({ data: initial, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    setState({ data: initial, loading: true, error: '' });
    loader()
      .then((data) => {
        if (active) setState({ data, loading: false, error: '' });
      })
      .catch((error) => {
        if (active)
          setState({
            data: initial,
            loading: false,
            error: apiError(error, 'Не удалось загрузить данные. Повторите попытку.'),
          });
      });
    return () => {
      active = false;
    };
    // The initial empty value is used only when the loader or refresh key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, refresh]);
  return state;
}

function LoadState({ loading, error, empty }: { loading: boolean; error: string; empty: boolean }) {
  if (loading)
    return (
      <p className="admin-empty" role="status">
        Загрузка…
      </p>
    );
  if (error)
    return (
      <p className="admin-notice error" role="alert">
        {error}
      </p>
    );
  if (empty) return <p className="admin-empty">Пока нет записей</p>;
  return null;
}

export default function AdminPanel() {
  const auth = useContext(AuthContext);
  const [section, setSection] = useState<Section>('users');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [usersRole, setUsersRole] = useState('');
  const [usersPage, setUsersPage] = useState(0);
  const [userForm, setUserForm] = useState({
    isu: '',
    name: '',
    last_name: '',
    patronymic: '',
    password: '',
  });
  const [roles, setRoles] = useState<string[]>(['student']);
  const [userDept, setUserDept] = useState('');
  const [userGroup, setUserGroup] = useState('');
  const [roleIsu, setRoleIsu] = useState('');
  const [roleToAdd, setRoleToAdd] = useState('teacher');
  const [editingDept, setEditingDept] = useState<number | null>(null);
  const deptCodeRef = useRef<HTMLInputElement>(null);
  const [deptForm, setDeptForm] = useState({ code: '', name: '', alias: '' });
  const [groupDept, setGroupDept] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [bindDept, setBindDept] = useState('');
  const [bindGroup, setBindGroup] = useState('');
  const [bindIsu, setBindIsu] = useState('');
  const [subjectName, setSubjectName] = useState('');

  useEffect(() => {
    if (editingDept !== null) deptCodeRef.current?.focus();
  }, [editingDept]);

  const departments = useResource<Department[]>(
    useCallback(async () => {
      const all: Department[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data } = await api.listDepartments({ limit: 200, offset });
        all.push(...(data.departments || []));
        if (!data.has_more) return all;
      }
    }, []),
    refresh,
    []
  );
  const subjects = useResource<Subject[]>(
    useCallback(async () => {
      const all: Subject[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data } = await api.listSubjects({ limit: 200, offset });
        all.push(...(data || []));
        if (!data || data.length < 200) return all;
      }
    }, []),
    refresh,
    []
  );
  const users = useResource<AdminUser[]>(
    useCallback(
      async () =>
        (await api.listUsers({ limit: 51, offset: usersPage * 50, role: usersRole || undefined }))
          .data.users || [],
      [usersPage, usersRole]
    ),
    refresh,
    []
  );
  const userGroups = useResource<Group[]>(
    useCallback(
      async () => (userDept ? (await api.listGroupsByDepartment(Number(userDept))).data || [] : []),
      [userDept]
    ),
    refresh,
    []
  );
  const groups = useResource<Group[]>(
    useCallback(
      async () => (bindDept ? (await api.listGroupsByDepartment(Number(bindDept))).data || [] : []),
      [bindDept]
    ),
    refresh,
    []
  );
  const students = useResource<string[]>(
    useCallback(
      async () => (bindGroup ? (await api.listStudentsByGroup(bindGroup)).data.user_ids || [] : []),
      [bindGroup]
    ),
    refresh,
    []
  );

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ text: message, error: false });
      setRefresh((value) => value + 1);
    } catch (error) {
      setNotice({
        text: apiError(error, 'Не удалось сохранить изменения. Попробуйте ещё раз.'),
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent, action: () => Promise<unknown>, message: string) => {
    event.preventDefault();
    if (!busy) void run(action, message);
  };
  const resetDept = () => {
    setEditingDept(null);
    setDeptForm({ code: '', name: '', alias: '' });
  };
  const switchSection = (value: Section) => {
    setSection(value);
    setNotice(null);
  };
  const deptOptions = departments.data.map((d) => (
    <option key={d.id} value={d.id}>
      {d.code} — {d.name}
    </option>
  ));
  const current = sections.find((s) => s.id === section)!;
  const isStudent = roles.includes('student');

  if (!auth?.user || auth.user.role !== 'admin')
    return <div className="no-access">Нет доступа</div>;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">Управление системой</span>
          <h1>Администрирование</h1>
        </div>
        <span className="admin-account">{auth.user.name || auth.user.isu || auth.user.id}</span>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Разделы администрирования">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              aria-current={section === s.id ? 'page' : undefined}
              onClick={() => switchSection(s.id)}
            >
              <span className="admin-nav-number">{s.icon}</span>
              <span>
                {s.title}
                <small>{s.description}</small>
              </span>
            </button>
          ))}
        </nav>
        <main className="admin-main">
          <div className="admin-section-heading">
            <div>
              <h2>{current.title}</h2>
              <p>{current.description}</p>
            </div>
            <button
              className="admin-btn"
              type="button"
              disabled={busy}
              onClick={() => setRefresh((v) => v + 1)}
            >
              Обновить
            </button>
          </div>
          {notice && (
            <div
              className={`admin-notice ${notice.error ? 'error' : 'success'}`}
              role={notice.error ? 'alert' : 'status'}
            >
              {notice.text}
            </div>
          )}
          {departments.error && (
            <p className="admin-notice error" role="alert">
              Направления: {departments.error}
            </p>
          )}

          {section === 'users' && (
            <>
              <section className="admin-card">
                <h3>Новый пользователь</h3>
                <p className="admin-help">Учётная запись, роли и группа сохраняются за один шаг.</p>
                <form
                  onSubmit={(e) =>
                    submit(
                      e,
                      async () => {
                        await api.createUser({
                          ...userForm,
                          isu: userForm.isu.trim(),
                          name: userForm.name.trim(),
                          last_name: userForm.last_name.trim(),
                          roles,
                          ...(isStudent
                            ? { department_id: Number(userDept), group_code: userGroup }
                            : {}),
                        });
                        setUserForm({
                          isu: '',
                          name: '',
                          last_name: '',
                          patronymic: '',
                          password: '',
                        });
                        setUserGroup('');
                        setUserDept('');
                        setUsersPage(0);
                      },
                      'Пользователь создан. Роли и группа назначены.'
                    )
                  }
                >
                  <fieldset disabled={busy} className="admin-form-grid">
                    <label>
                      ИСУ
                      <input
                        required
                        inputMode="numeric"
                        value={userForm.isu}
                        onChange={(e) =>
                          setUserForm({ ...userForm, isu: e.target.value.replace(/\D/g, '') })
                        }
                      />
                    </label>
                    <label>
                      Фамилия
                      <input
                        required
                        maxLength={125}
                        value={userForm.last_name}
                        onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })}
                      />
                    </label>
                    <label>
                      Имя
                      <input
                        required
                        maxLength={125}
                        value={userForm.name}
                        onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                      />
                    </label>
                    <label>
                      Отчество <span className="admin-optional">необязательно</span>
                      <input
                        maxLength={125}
                        value={userForm.patronymic}
                        onChange={(e) => setUserForm({ ...userForm, patronymic: e.target.value })}
                      />
                    </label>
                    <label>
                      Пароль
                      <input
                        required
                        type="password"
                        autoComplete="new-password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      />
                    </label>
                    <fieldset className="admin-roles">
                      <legend>Роли</legend>
                      {Object.entries(roleNames).map(([value, label]) => (
                        <label key={value}>
                          <input
                            type="checkbox"
                            checked={roles.includes(value)}
                            onChange={(e) => {
                              setRoles(
                                e.target.checked
                                  ? [...roles, value]
                                  : roles.filter((r) => r !== value)
                              );
                              if (value === 'student' && !e.target.checked) {
                                setUserDept('');
                                setUserGroup('');
                              }
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    {isStudent && (
                      <>
                        <label>
                          Направление
                          <select
                            required
                            disabled={departments.loading || !!departments.error}
                            value={userDept}
                            onChange={(e) => {
                              setUserDept(e.target.value);
                              setUserGroup('');
                            }}
                          >
                            <option value="">Выберите направление</option>
                            {deptOptions}
                          </select>
                        </label>
                        <label>
                          Группа
                          <select
                            required
                            value={userGroup}
                            disabled={!userDept || userGroups.loading || !!userGroups.error}
                            onChange={(e) => setUserGroup(e.target.value)}
                          >
                            <option value="">
                              {userGroups.loading ? 'Загрузка…' : 'Выберите группу'}
                            </option>
                            {userGroups.data.map((g) => (
                              <option key={g.code} value={g.code}>
                                {g.code}
                              </option>
                            ))}
                          </select>
                        </label>
                        {userGroups.error && (
                          <p role="alert" className="admin-notice error">
                            {userGroups.error}
                          </p>
                        )}
                        {userDept &&
                          !userGroups.loading &&
                          !userGroups.error &&
                          !userGroups.data.length && (
                            <p className="admin-help">
                              В этом направлении нет групп. Добавьте группу в разделе «Группы».
                            </p>
                          )}
                      </>
                    )}
                    <div className="admin-actions full">
                      <button
                        className="admin-btn primary"
                        disabled={
                          busy ||
                          !roles.length ||
                          (isStudent &&
                            (!userDept ||
                              !userGroup ||
                              userGroups.loading ||
                              !!userGroups.error ||
                              !userGroups.data.some((g) => g.code === userGroup)))
                        }
                        type="submit"
                      >
                        {busy ? 'Сохранение…' : 'Создать пользователя'}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </section>
              <section className="admin-card">
                <div className="admin-table-heading">
                  <h3>Список пользователей</h3>
                  <label>
                    Роль
                    <select
                      value={usersRole}
                      onChange={(e) => {
                        setUsersRole(e.target.value);
                        setUsersPage(0);
                      }}
                    >
                      <option value="">Все роли</option>
                      {Object.entries(roleNames).map(([v, title]) => (
                        <option key={v} value={v}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <LoadState {...users} empty={!users.data.length} />
                {!users.loading && !users.error && users.data.length > 0 && (
                  <div className="admin-table-scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Пользователь</th>
                          <th>ИСУ</th>
                          <th>Роли</th>
                          <th>
                            <span className="admin-sr-only">Действия</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.data.slice(0, 50).map((u) => (
                          <tr key={u.isu}>
                            <td>
                              {u.last_name} {u.first_name}
                            </td>
                            <td className="admin-code">{u.isu}</td>
                            <td>
                              <div className="admin-badges">
                                {(u.roles || []).map((role) => (
                                  <span key={role} className={`admin-badge ${role}`}>
                                    {roleNames[role] || role}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <button
                                disabled={busy}
                                className="admin-btn danger small"
                                type="button"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Удалить пользователя ${u.last_name} ${u.first_name} (${u.isu})?`
                                    )
                                  )
                                    void run(async () => {
                                      await api.deleteUser(u.isu);
                                      if (users.data.length === 1 && usersPage > 0)
                                        setUsersPage((p) => p - 1);
                                    }, 'Пользователь удалён');
                                }}
                              >
                                Удалить
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="admin-pagination">
                  <button
                    className="admin-btn small"
                    disabled={!usersPage || users.loading || busy}
                    onClick={() => setUsersPage((p) => p - 1)}
                  >
                    Назад
                  </button>
                  <span>Страница {usersPage + 1}</span>
                  <button
                    className="admin-btn small"
                    disabled={users.data.length <= 50 || users.loading || !!users.error || busy}
                    onClick={() => setUsersPage((p) => p + 1)}
                  >
                    Далее
                  </button>
                </div>
              </section>
              <details className="admin-card">
                <summary>Добавить роль существующему пользователю</summary>
                <form
                  onSubmit={(e) =>
                    submit(
                      e,
                      async () => {
                        await api.addRole({ isu: roleIsu.trim(), role: roleToAdd });
                        setRoleIsu('');
                      },
                      'Роль добавлена'
                    )
                  }
                >
                  <fieldset disabled={busy} className="admin-form-grid">
                    <label>
                      ИСУ
                      <input
                        required
                        inputMode="numeric"
                        value={roleIsu}
                        onChange={(e) => setRoleIsu(e.target.value.replace(/\D/g, ''))}
                      />
                    </label>
                    <label>
                      Роль
                      <select value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value)}>
                        {Object.entries(roleNames).map(([v, title]) => (
                          <option key={v} value={v}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="admin-actions full">
                      <button className="admin-btn" type="submit">
                        Добавить роль
                      </button>
                    </div>
                  </fieldset>
                </form>
              </details>
            </>
          )}

          {section === 'departments' && (
            <>
              <section className="admin-card">
                <h3>{editingDept === null ? 'Новое направление' : 'Редактирование направления'}</h3>
                {editingDept !== null && (
                  <p className="admin-help">
                    При смене кода группы и студенты сохранят связь с направлением.
                  </p>
                )}
                <form
                  onSubmit={(e) =>
                    submit(
                      e,
                      async () => {
                        const payload = {
                          code: deptForm.code.trim(),
                          name: deptForm.name.trim(),
                          alias: deptForm.alias.trim(),
                        };
                        if (editingDept === null)
                          await api.createDepartment({
                            ...payload,
                            alias: payload.alias || undefined,
                          });
                        else
                          await api.updateDepartment(editingDept, {
                            ...payload,
                            alias: payload.alias || null,
                          });
                        resetDept();
                      },
                      editingDept === null ? 'Направление создано' : 'Направление обновлено'
                    )
                  }
                >
                  <fieldset disabled={busy} className="admin-form-grid">
                    <label>
                      Код
                      <input
                        ref={deptCodeRef}
                        required
                        maxLength={125}
                        value={deptForm.code}
                        onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                        placeholder="09.03.01"
                      />
                    </label>
                    <label>
                      Название
                      <input
                        required
                        maxLength={125}
                        value={deptForm.name}
                        onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                      />
                    </label>
                    <label>
                      Псевдоним <span className="admin-optional">необязательно</span>
                      <input
                        maxLength={125}
                        value={deptForm.alias}
                        onChange={(e) => setDeptForm({ ...deptForm, alias: e.target.value })}
                        placeholder="ИВТ"
                      />
                    </label>
                    <div className="admin-actions full">
                      <button className="admin-btn primary" type="submit">
                        {editingDept === null ? 'Создать направление' : 'Сохранить изменения'}
                      </button>
                      {editingDept !== null && (
                        <button className="admin-btn" type="button" onClick={resetDept}>
                          Отменить
                        </button>
                      )}
                    </div>
                  </fieldset>
                </form>
              </section>
              <section className="admin-card">
                <h3>
                  Все направления <span className="admin-count">{departments.data.length}</span>
                </h3>
                <LoadState {...departments} empty={!departments.data.length} />
                {!departments.loading && !departments.error && departments.data.length > 0 && (
                  <div className="admin-table-scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Код</th>
                          <th>Название</th>
                          <th>Псевдоним</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departments.data.map((d) => (
                          <tr key={d.id}>
                            <td className="admin-code">{d.code}</td>
                            <td>{d.name}</td>
                            <td>{d.alias || '—'}</td>
                            <td>
                              <div className="admin-actions">
                                <button
                                  className="admin-btn small"
                                  disabled={busy}
                                  type="button"
                                  onClick={() => {
                                    setEditingDept(d.id);
                                    setDeptForm({
                                      code: d.code,
                                      name: d.name,
                                      alias: d.alias || '',
                                    });
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                >
                                  Изменить
                                </button>
                                <button
                                  className="admin-btn danger small"
                                  disabled={busy}
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Удалить направление «${d.code} — ${d.name}»?`))
                                      void run(async () => {
                                        await api.deleteDepartment(d.id);
                                        if (editingDept === d.id) resetDept();
                                      }, 'Направление удалено');
                                  }}
                                >
                                  Удалить
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {section === 'groups' && (
            <>
              <section className="admin-card">
                <h3>Новая группа</h3>
                <form
                  onSubmit={(e) =>
                    submit(
                      e,
                      async () => {
                        await api.createGroup({
                          code: groupCode.trim(),
                          department_id: Number(groupDept),
                        });
                        setGroupCode('');
                      },
                      'Группа создана'
                    )
                  }
                >
                  <fieldset disabled={busy} className="admin-form-grid">
                    <label>
                      Направление
                      <select
                        required
                        value={groupDept}
                        disabled={departments.loading || !!departments.error}
                        onChange={(e) => setGroupDept(e.target.value)}
                      >
                        <option value="">Выберите направление</option>
                        {deptOptions}
                      </select>
                    </label>
                    <label>
                      Код группы
                      <input
                        required
                        maxLength={25}
                        value={groupCode}
                        onChange={(e) => setGroupCode(e.target.value)}
                        placeholder="P3215"
                      />
                    </label>
                    <div className="admin-actions full">
                      <button type="submit" className="admin-btn primary" disabled={!groupDept}>
                        Создать группу
                      </button>
                    </div>
                  </fieldset>
                </form>
              </section>
              <section className="admin-card">
                <h3>Состав группы</h3>
                <div className="admin-form-grid">
                  <label>
                    Направление
                    <select
                      value={bindDept}
                      disabled={busy || departments.loading || !!departments.error}
                      onChange={(e) => {
                        setBindDept(e.target.value);
                        setBindGroup('');
                      }}
                    >
                      <option value="">Выберите направление</option>
                      {deptOptions}
                    </select>
                  </label>
                  <label>
                    Группа
                    <select
                      value={bindGroup}
                      disabled={busy || !bindDept || groups.loading || !!groups.error}
                      onChange={(e) => setBindGroup(e.target.value)}
                    >
                      <option value="">Выберите группу</option>
                      {groups.data.map((g) => (
                        <option key={g.code} value={g.code}>
                          {g.code}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {groups.error && (
                  <p role="alert" className="admin-notice error">
                    {groups.error}
                  </p>
                )}
                {bindDept && !groups.loading && !groups.error && !groups.data.length && (
                  <p className="admin-help">В этом направлении пока нет групп.</p>
                )}
                {bindGroup && (
                  <>
                    <div className="admin-table-heading">
                      <h4>Группа {bindGroup}</h4>
                      <button
                        className="admin-btn danger small"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          if (confirm(`Удалить группу «${bindGroup}»?`))
                            void run(async () => {
                              await api.deleteGroup(bindGroup);
                              setBindGroup('');
                            }, 'Группа удалена');
                        }}
                      >
                        Удалить группу
                      </button>
                    </div>
                    <form
                      onSubmit={(e) =>
                        submit(
                          e,
                          async () => {
                            await api.setStudentGroup(bindIsu, {
                              user_id: bindIsu,
                              group_code: bindGroup,
                            });
                            setBindIsu('');
                          },
                          'Студент добавлен в группу'
                        )
                      }
                    >
                      <fieldset className="admin-inline-form" disabled={busy}>
                        <label>
                          ИСУ студента
                          <input
                            required
                            inputMode="numeric"
                            value={bindIsu}
                            onChange={(e) => setBindIsu(e.target.value.replace(/\D/g, ''))}
                          />
                        </label>
                        <button type="submit" className="admin-btn primary">
                          Добавить в группу
                        </button>
                      </fieldset>
                    </form>
                    <LoadState {...students} empty={!students.data.length} />
                    {!students.loading && !students.error && students.data.length > 0 && (
                      <div className="admin-table-scroll">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>ИСУ студента</th>
                              <th>Действия</th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.data.map((isu) => (
                              <tr key={isu}>
                                <td className="admin-code">{isu}</td>
                                <td>
                                  <button
                                    className="admin-btn danger small"
                                    disabled={busy}
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Убрать студента ${isu} из группы ${bindGroup}?`))
                                        void run(
                                          () => api.removeStudentGroup(isu),
                                          'Студент убран из группы'
                                        );
                                    }}
                                  >
                                    Убрать из группы
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}

          {section === 'subjects' && (
            <>
              <section className="admin-card">
                <h3>Новый предмет</h3>
                <form
                  onSubmit={(e) =>
                    submit(
                      e,
                      async () => {
                        await api.createSubject({ name: subjectName.trim() });
                        setSubjectName('');
                      },
                      'Предмет создан'
                    )
                  }
                >
                  <fieldset className="admin-inline-form" disabled={busy}>
                    <label>
                      Название предмета
                      <input
                        required
                        maxLength={125}
                        value={subjectName}
                        onChange={(e) => setSubjectName(e.target.value)}
                      />
                    </label>
                    <button className="admin-btn primary" type="submit">
                      Создать предмет
                    </button>
                  </fieldset>
                </form>
              </section>
              <section className="admin-card">
                <h3>
                  Все предметы <span className="admin-count">{subjects.data.length}</span>
                </h3>
                <LoadState {...subjects} empty={!subjects.data.length} />
                {!subjects.loading && !subjects.error && subjects.data.length > 0 && (
                  <div className="admin-table-scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Название</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjects.data.map((s) => (
                          <tr key={s.id}>
                            <td>{s.name}</td>
                            <td>
                              <button
                                className="admin-btn danger small"
                                disabled={busy}
                                type="button"
                                onClick={() => {
                                  if (confirm(`Удалить предмет «${s.name}»?`))
                                    void run(() => api.deleteSubject(s.id), 'Предмет удалён');
                                }}
                              >
                                Удалить
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
