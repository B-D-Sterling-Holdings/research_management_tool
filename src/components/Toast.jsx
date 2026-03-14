'use client';

import { useEffect } from 'react';

export default function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const styles = type === 'success' ? 'bg-emerald-600 text-white'
    : type === 'error' ? 'bg-red-500 text-white'
    : type === 'warning' ? 'bg-amber-500 text-white'
    : 'bg-gray-900 text-white';

  return (
    <div className={`fixed bottom-5 right-5 z-50 px-5 py-3 rounded-2xl text-sm font-semibold ${styles} shadow-xl animate-[slideIn_0.3s_ease]`}>
      {message}
    </div>
  );
}
