'use client';

import { useEffect } from 'react';

export default function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bg = type === 'success' ? 'bg-emerald-600'
    : type === 'error' ? 'bg-red-600'
    : type === 'warning' ? 'bg-amber-500 text-black'
    : 'bg-blue-600';

  return (
    <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg text-sm font-medium text-white ${bg} shadow-lg animate-[slideIn_0.3s_ease]`}>
      {message}
    </div>
  );
}
