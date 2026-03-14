'use client';

export default function Card({ title, actions, children, className = '' }) {
  return (
    <div className={`bg-[#111] border border-[#1e1e1e] rounded-lg p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-sm font-semibold text-[#e8e8e8] uppercase tracking-wider">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
