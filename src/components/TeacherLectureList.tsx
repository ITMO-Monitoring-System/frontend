import { useState } from 'react';
import { lectureStatus, type Lecture } from '../types';

type Props = {
  hidden: boolean;
  lectures: Lecture[];
  loading: boolean;
  error: string;
  busy: boolean;
  activeId: number | null;
  syncingId: number | null;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (lecture: Lecture) => void;
  onEdit: (lecture: Lecture) => void;
  onStart: (lecture: Lecture) => void;
};

export default function TeacherLectureList(props: Props) {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [day, setDay] = useState('');
  const [order, setOrder] = useState('newest');
  const searchTerm = query.trim().toLocaleLowerCase('ru');
  const subjects = new Map(
    props.lectures.map((lecture) => [lecture.subject_id, lecture.subject_name])
  );
  const rows = props.lectures
    .filter((lecture) => {
      const date = new Date(lecture.date);
      const localDay = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-');
      const searchable = [
        lecture.subject_name,
        ...lecture.group_ids,
        ...lecture.department_codes,
        lectureStatus[lecture.status],
        date.toLocaleDateString('ru-RU'),
      ]
        .join(' ')
        .toLocaleLowerCase('ru');
      return (
        (!day || day === localDay) &&
        (!subject || String(lecture.subject_id) === subject) &&
        searchable.includes(searchTerm)
      );
    })
    .sort((a, b) => {
      if (order === 'subject') {
        const byName = a.subject_name.localeCompare(b.subject_name, 'ru');
        if (byName) return byName;
      }
      const byDate = Date.parse(b.date) - Date.parse(a.date) || b.id - a.id;
      return order === 'oldest' ? -byDate : byDate;
    });

  return (
    <section className="lecture-catalog" hidden={props.hidden}>
      <header>
        <h2>Мои лекции</h2>
        <button className="btn primary" disabled={props.busy} onClick={props.onCreate}>
          Создать лекцию
        </button>
      </header>
      <div className="catalog-filters">
        <label>
          Поиск
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Предмет, направление или группа"
          />
        </label>
        <label>
          Предмет
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Все предметы</option>
            {[...subjects]
              .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Дата
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label>
          Сортировка
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала ранние</option>
            <option value="subject">По предмету</option>
          </select>
        </label>
      </div>
      {props.error && (
        <p role="alert">
          {props.error}{' '}
          <button className="btn" onClick={props.onRetry}>
            Повторить
          </button>
        </p>
      )}
      {!rows.length && !props.error && (
        <p role="status">
          {props.loading
            ? 'Загрузка лекций…'
            : props.lectures.length
              ? 'По заданным условиям лекций нет'
              : 'Лекций пока нет'}
        </p>
      )}
      <div className="catalog-grid">
        {rows.map((lecture) => (
          <article key={lecture.id}>
            <header>
              <h3>{lecture.subject_name}</h3>
              <span className={'catalog-status ' + lecture.status}>
                {props.syncingId === lecture.id ? 'Обновляем статус…' : lectureStatus[lecture.status]}
              </span>
            </header>
            <time dateTime={lecture.date}>
              {new Date(lecture.date).toLocaleString('ru-RU', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </time>
            <dl>
              <dt>Направления</dt>
              <dd>{lecture.department_codes.join(', ') || '—'}</dd>
              <dt>Группы</dt>
              <dd>{lecture.group_ids.join(', ') || '—'}</dd>
            </dl>
            <footer>
              <button
                className="btn"
                disabled={props.busy && props.activeId !== lecture.id}
                onClick={() => props.onOpen(lecture)}
              >
                Открыть
              </button>
              <button
                className="btn"
                disabled={props.busy || props.syncingId === lecture.id || lecture.status === 'running'}
                onClick={() => props.onEdit(lecture)}
              >
                Редактировать
              </button>
              <button
                className="btn primary"
                disabled={props.busy || props.syncingId === lecture.id}
                onClick={() => props.onStart(lecture)}
              >
                {lecture.status === 'running' ? 'Подключиться' : 'Запустить'}
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
