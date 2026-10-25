import { useState } from 'react';
import TeacherAnalytics from './TeacherAnalytics';
import './TeacherAnalyticsCard.css';

export default function TeacherAnalyticsCard() {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="analytics-card">
      <button
        className="analytics-card-header"
        type="button"
        aria-expanded={isExpanded}
        aria-controls="teacher-analytics-content"
        onClick={() => setIsExpanded((value) => !value)}
      >
        <span className="analytics-card-title">Аналитика посещений лекций</span>
        <span className="analytics-card-toggle" aria-hidden="true">
          {isExpanded ? '−' : '+'}
        </span>
      </button>
      {isExpanded && (
        <div className="analytics-card-content" id="teacher-analytics-content">
          <div className="analytics-card-description">
            <p>
              Посещаемость по лекциям, группам и студентам, динамика по неделям и экспорт за
              выбранный период.
            </p>
          </div>
          <TeacherAnalytics />
        </div>
      )}
    </div>
  );
}
