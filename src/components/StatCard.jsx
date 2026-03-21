'use client';

const variants = {
  default: {
    bg: 'bg-white',
    border: 'border-gray-100',
    hoverShadow: 'hover:shadow-lg hover:shadow-emerald-100/50',
    labelColor: 'text-gray-400',
    valueClass: 'text-gray-900',
  },
  positive: {
    bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/60',
    border: 'border-emerald-200/60',
    hoverShadow: 'hover:shadow-lg hover:shadow-emerald-200/60',
    labelColor: 'text-emerald-700/60',
    valueClass: 'text-emerald-700',
  },
  negative: {
    bg: 'bg-gradient-to-br from-red-50 to-red-100/60',
    border: 'border-red-200/60',
    hoverShadow: 'hover:shadow-lg hover:shadow-red-200/60',
    labelColor: 'text-red-700/60',
    valueClass: 'text-red-600',
  },
};

export default function StatCard({ label, value, sub, variant = 'default' }) {
  const v = variants[variant] || variants.default;

  return (
    <div className={`${v.bg} rounded-3xl border ${v.border} p-6 shadow-sm ${v.hoverShadow} transition-all duration-500`}>
      <div className="text-2xl font-bold leading-tight">
        {value === null || value === undefined ? (
          <div className="h-7 w-20 rounded-lg skeleton" />
        ) : (
          <span className={v.valueClass}>{value}</span>
        )}
      </div>
      <div className={`text-xs ${v.labelColor} mt-1`}>{label}</div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
