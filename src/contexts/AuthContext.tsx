/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { me } from '../services/api';
import { AuthTokenStorage } from '../services/authToken';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<any>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(AuthTokenStorage.get());

  useEffect(() => {
    async function fetch() {
      if (token) {
        try {
          const r = await me();
          setUser(r.data);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          AuthTokenStorage.clear();
          setToken(null);
          setUser(null);
        }
      }
    }
    fetch();
  }, [token]);

  const login = (token: string) => {
    AuthTokenStorage.set(token);
    setToken(token);
  };
  const logout = () => {
    AuthTokenStorage.clear();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
