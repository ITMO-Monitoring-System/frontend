import { useState } from 'react';
import './login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Вход в систему</h1>
        <p className="login-subtitle">Система учёта посещаемости</p>

        <form className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <button type="submit">Войти</button>
        </form>

        <div className="login-footer">
          Нет аккаунта? <span>Обратитесь к администратору</span>
        </div>
      </div>
    </div>
  );
}
