'use client';

import { useAuth } from '@/lib/AuthContext';
import { useEffect } from 'react';

export default function AuthGate({ children }) {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) {
      window.location.href = '/login';
    }
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Redirecting to login...</p>
      </div>
    );
  }

  return children;
}
