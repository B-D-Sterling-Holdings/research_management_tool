'use client';

export default function StatCard({ label, value, sub, color }) {
  const borderColor = color === 'green' ? 'border-t-emerald-500'
    : color === 'red' ? 'border-t-red-500'
    : color === 'yellow' ? 'border-t-amber-500'
    : 'border-t-blue-500';

  return (
    <div className={`bg-[#111] border border-[#1e1e1e] ${borderColor} border-t-2 rounded-lg p-5`}>
      <p className="text-2xl font-bold text-[#e8e8e8]">{value}</p>
      <p className="text-xs text-[#666] uppercase tracking-wider mt-1">{label}</p>
      {sub && <p className="text-xs text-[#a0a0a0] mt-1">{sub}</p>}
    </div>
  );
}
