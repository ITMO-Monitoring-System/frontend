/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from 'react';
import { createUser } from '../services/api';

export default function AdminPanel() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');

  const add = async () => {
    try {
      await createUser({ name, email, role });
      alert('Created');
      setName('');
      setEmail('');
    } catch (e) {
      alert('Error');
    }
  };

  return (
    <div className="p-4 border rounded">
      <h3 className="font-semibold mb-2">Admin: добавить человека</h3>
      <input
        className="w-full p-2 border mb-2"
        placeholder="Имя"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="w-full p-2 border mb-2"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <select
        className="w-full p-2 border mb-2"
        value={role}
        onChange={(e) => setRole(String(e.target.value))}
      >
        <option value="student">student</option>
        <option value="teacher">teacher</option>
        <option value="admin">admin</option>
      </select>
      <button onClick={add} className="px-3 py-1 bg-blue-600 text-white rounded">
        Добавить
      </button>
    </div>
  );
}
