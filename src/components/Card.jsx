'use client';

export default function Card({ title, actions, children, className = '' }) {
  return (
    <div className={`bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-lg hover:shadow-emerald-100/50 transition-all duration-500 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-5">
          {title && <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
