import React, { useState } from 'react';
import TeacherAnalytics from './TeacherAnalytics';
import './TeacherAnalyticsCard.css';

const TeacherAnalyticsCard: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="analytics-card">
      <div 
        className="analytics-card-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="analytics-card-title">
          <span className="analytics-icon"></span>
          <h3>Аналитика посещений лекций</h3>
        </div>
        <button 
          className="analytics-card-toggle"
          aria-label={isExpanded ? 'Свернуть аналитику' : 'Развернуть аналитику'}
        >
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>
      
      {isExpanded && (
        <div className="analytics-card-content">
          <div className="analytics-card-description">
            <p>Просмотр статистики посещаемости студентов по вашим лекциям. Выберите предмет, лекцию и группу для получения данных.</p>
          </div>
          <TeacherAnalytics />
        </div>
      )}
    </div>
  );
};

export default TeacherAnalyticsCard;