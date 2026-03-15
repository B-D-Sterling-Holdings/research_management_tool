'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const tokenRef = useRef(null);

  // Monkey-patch global fetch to inject Authorization header for /api/ calls
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (tokenRef.current && url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
        init = init || {};
        init.headers = {
          ...(init.headers || {}),
          Authorization: `Bearer ${tokenRef.current}`,
        };
      }
      return originalFetch.call(this, input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await window.fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Invalid credentials');
    }

    const { token: jwt } = await res.json();
    tokenRef.current = jwt;
    setToken(jwt);
    return true;
  }, []);

  const logout = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
