import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import {
  getTeacherSubjects,
  getTeacherLecturesBySubject,
  getLectureGroups,
  getLectureGroupStudents,
} from '../services/api';

interface TeacherSubject {
  id: number;
  name: string;
}

interface TeacherLecture {
  date: string;
  lecture_id: number;
}

interface TeacherGroup {
  group_code: string;
}

interface TeacherStudent {
  isu: string;
  last_name: string;
  first_name: string;
  patronymic: string;
  present_seconds: number;
}

const TeacherAnalytics: React.FC = () => {
  useContext(AuthContext);
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [teacherLectures, setTeacherLectures] = useState<TeacherLecture[]>([]);
  const [selectedLectureId, setSelectedLectureId] = useState<number | null>(null);
  const [lectureGroups, setLectureGroups] = useState<TeacherGroup[]>([]);
  const [selectedGroupCode, setSelectedGroupCode] = useState<string>('');
  const [teacherStudents, setTeacherStudents] = useState<TeacherStudent[]>([]);
  const [studentsMeta, setStudentsMeta] = useState<{ page: number; page_size: number; total: number }>({
    page: 1,
    page_size: 50,
    total: 0,
  });
  const [loading, setLoading] = useState({
    subjects: false,
    lectures: false,
    groups: false,
    students: false,
  });

  // Загрузка предметов преподавателя
  useEffect(() => {
    loadTeacherSubjects();
  }, []);

  // Загрузка лекций при выборе предмета
  useEffect(() => {
    if (selectedSubjectId !== null) {
      loadTeacherLectures(selectedSubjectId);
    } else {
      setTeacherLectures([]);
      setSelectedLectureId(null);
    }
  }, [selectedSubjectId]);

  // Загрузка групп при выборе лекции
  useEffect(() => {
    if (selectedLectureId !== null) {
      loadLectureGroups(selectedLectureId);
    } else {
      setLectureGroups([]);
      setSelectedGroupCode('');
    }
  }, [selectedLectureId]);

  // Загрузка студентов при выборе группы
  useEffect(() => {
    if (selectedLectureId !== null && selectedGroupCode) {
      loadGroupStudents(selectedLectureId, selectedGroupCode);
    } else {
      setTeacherStudents([]);
    }
  }, [selectedLectureId, selectedGroupCode]);

  const loadTeacherSubjects = async () => {
    try {
      setLoading(prev => ({ ...prev, subjects: true }));
      const response = await getTeacherSubjects();
      setTeacherSubjects(response.data.subjects || []);
    } catch (error) {
      console.error('Ошибка загрузки предметов:', error);
      setTeacherSubjects([]);
    } finally {
      setLoading(prev => ({ ...prev, subjects: false }));
    }
  };

  const loadTeacherLectures = async (subjectId: number) => {
    try {
      setLoading(prev => ({ ...prev, lectures: true }));
      setTeacherLectures([]);
      setSelectedLectureId(null);
      setLectureGroups([]);
      setSelectedGroupCode('');
      setTeacherStudents([]);
      
      const response = await getTeacherLecturesBySubject(subjectId, {
        order: 'desc',
        page: 1,
        page_size: 100,
      });
      setTeacherLectures(response.data.items || []);
    } catch (error) {
      console.error('Ошибка загрузки лекций:', error);
      setTeacherLectures([]);
    } finally {
      setLoading(prev => ({ ...prev, lectures: false }));
    }
  };

  const loadLectureGroups = async (lectureId: number) => {
    try {
      setLoading(prev => ({ ...prev, groups: true }));
      setLectureGroups([]);
      setSelectedGroupCode('');
      setTeacherStudents([]);
      
      const response = await getLectureGroups(lectureId);
      setLectureGroups(response.data.groups || []);
    } catch (error) {
      console.error('Ошибка загрузки групп:', error);
      setLectureGroups([]);
    } finally {
      setLoading(prev => ({ ...prev, groups: false }));
    }
  };

  const loadGroupStudents = async (lectureId: number, groupCode: string, page: number = 1) => {
    try {
      setLoading(prev => ({ ...prev, students: true }));
      const response = await getLectureGroupStudents(lectureId, groupCode, {
        page,
        page_size: studentsMeta.page_size,
        gap_seconds: 1,
      });
      setTeacherStudents(response.data.items || []);
      setStudentsMeta(response.data.meta);
    } catch (error) {
      console.error('Ошибка загрузки студентов:', error);
      setTeacherStudents([]);
    } finally {
      setLoading(prev => ({ ...prev, students: false }));
    }
  };

  const formatSeconds = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const hh = Math.floor(seconds / 3600);
    const mm = Math.floor((seconds % 3600) / 60);
    const ss = seconds % 60;
    if (hh > 0) return `${hh}h ${String(mm).padStart(2, '0')}m`;
    if (mm > 0) return `${mm}m ${String(ss).padStart(2, '0')}s`;
    return `${ss}s`;
  };

  const exportAnalyticsToCSV = () => {
    if (teacherStudents.length === 0) {
      alert('Нет данных для экспорта');
      return;
    }

    const headers = ['ISU', 'Фамилия', 'Имя', 'Отчество', 'Время присутствия', 'Время присутствия (сек)'];
    const rows = teacherStudents.map(student => [
      student.isu,
      student.last_name,
      student.first_name,
      student.patronymic,
      formatSeconds(student.present_seconds),
      student.present_seconds.toString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const subjectName = teacherSubjects.find(s => s.id === selectedSubjectId)?.name || 'subject';
    const fileName = `analytics_${subjectName}_lecture_${selectedLectureId}_group_${selectedGroupCode}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '') {
      setSelectedSubjectId(null);
    } else {
      setSelectedSubjectId(parseInt(value, 10));
    }
  };

  const handleLectureChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '') {
      setSelectedLectureId(null);
    } else {
      setSelectedLectureId(parseInt(value, 10));
    }
  };

  const handlePrevPage = () => {
    if (selectedLectureId !== null && selectedGroupCode && studentsMeta.page > 1) {
      loadGroupStudents(selectedLectureId, selectedGroupCode, studentsMeta.page - 1);
    }
  };

  const handleNextPage = () => {
    if (selectedLectureId !== null && selectedGroupCode && 
        studentsMeta.page < Math.ceil(studentsMeta.total / studentsMeta.page_size)) {
      loadGroupStudents(selectedLectureId, selectedGroupCode, studentsMeta.page + 1);
    }
  };

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h2>Аналитика посещений лекций</h2>
        <p>Просмотр статистики посещаемости студентов по вашим лекциям</p>
      </div>

      <div className="analytics-filters">
        <div className="filter-row">
          <div className="filter-group">
            <label>Предмет</label>
            <select
              className="filter-select"
              value={selectedSubjectId ?? ''}
              onChange={handleSubjectChange}
              disabled={loading.subjects}
            >
              <option value="">Выберите предмет</option>
              {teacherSubjects.map(subject => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            {loading.subjects && <div className="loading-spinner small"></div>}
          </div>

          <div className="filter-group">
            <label>Лекция</label>
            <select
              className="filter-select"
              value={selectedLectureId ?? ''}
              onChange={handleLectureChange}
              disabled={!selectedSubjectId || loading.lectures}
            >
              <option value="">Выберите лекцию</option>
              {teacherLectures.map(lecture => (
                <option key={lecture.lecture_id} value={lecture.lecture_id}>
                  {new Date(lecture.date).toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </option>
              ))}
            </select>
            {loading.lectures && <div className="loading-spinner small"></div>}
          </div>

          <div className="filter-group">
            <label>Группа</label>
            <select
              className="filter-select"
              value={selectedGroupCode}
              onChange={(e) => setSelectedGroupCode(e.target.value)}
              disabled={!selectedLectureId || loading.groups}
            >
              <option value="">Выберите группу</option>
              {lectureGroups.map(group => (
                <option key={group.group_code} value={group.group_code}>
                  {group.group_code}
                </option>
              ))}
            </select>
            {loading.groups && <div className="loading-spinner small"></div>}
          </div>
        </div>
      </div>

      <div className="analytics-content">
        {loading.students ? (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Загрузка данных...</p>
          </div>
        ) : teacherStudents.length > 0 ? (
          <>
            <div className="analytics-actions">
              <div className="analytics-stats">
                <span>Всего студентов: <strong>{studentsMeta.total}</strong></span>
                <span>Страница: <strong>{studentsMeta.page}</strong> из <strong>{Math.ceil(studentsMeta.total / studentsMeta.page_size)}</strong></span>
              </div>
              <button 
                className="btn primary"
                onClick={exportAnalyticsToCSV}
                disabled={teacherStudents.length === 0}
              >
                📥 Экспорт в CSV
              </button>
            </div>

            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>ISU</th>
                    <th>Фамилия</th>
                    <th>Имя</th>
                    <th>Отчество</th>
                    <th>Время присутствия</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherStudents.map((student, index) => {
                    const presencePercentage = selectedLectureId ? 
                      (student.present_seconds / (90 * 60)) * 100 : 0; // Предполагаем лекцию 90 минут
                    const status = presencePercentage >= 80 ? 'Присутствовал' : 
                                  presencePercentage >= 30 ? 'Частично' : 'Отсутствовал';
                    
                    return (
                      <tr key={`${student.isu}_${index}`}>
                        <td>{student.isu}</td>
                        <td>{student.last_name}</td>
                        <td>{student.first_name}</td>
                        <td>{student.patronymic || '-'}</td>
                        <td>
                          <div className="presence-cell">
                            <span>{formatSeconds(student.present_seconds)}</span>
                            <div className="presence-bar">
                              <div 
                                className="presence-fill"
                                style={{ width: `${Math.min(presencePercentage, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${status === 'Присутствовал' ? 'present' : 
                                          status === 'Частично' ? 'partial' : 'absent'}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {studentsMeta.total > studentsMeta.page_size && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={handlePrevPage}
                  disabled={studentsMeta.page <= 1 || !selectedLectureId || !selectedGroupCode}
                >
                  ← Назад
                </button>
                <span className="pagination-info">
                  Страница {studentsMeta.page} из {Math.ceil(studentsMeta.total / studentsMeta.page_size)}
                </span>
                <button
                  className="pagination-btn"
                  onClick={handleNextPage}
                  disabled={studentsMeta.page >= Math.ceil(studentsMeta.total / studentsMeta.page_size) || 
                          !selectedLectureId || !selectedGroupCode}
                >
                  Вперёд →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="analytics-empty">
            {!selectedSubjectId && !selectedLectureId && !selectedGroupCode ? (
              <>
                <div className="empty-icon"></div>
                <h3>Выберите предмет, лекцию и группу</h3>
                <p>Для просмотра статистики посещаемости выберите предмет, затем лекцию и группу</p>
              </>
            ) : (
              <>
                <div className="empty-icon"></div>
                <h3>Нет данных</h3>
                <p>По выбранным критериям нет данных о посещаемости</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherAnalytics;