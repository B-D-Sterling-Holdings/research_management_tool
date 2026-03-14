'use client';

export default function Treemap({ positions, mode = 'alltime' }) {
  if (!positions || !positions.length) {
    return <div className="text-[#666] text-sm text-center py-8 border border-dashed border-[#1e1e1e] rounded">No positions to display</div>;
  }

  const total = positions.reduce((s, p) => s + (p.value || 0), 0);
  if (total <= 0) return null;

  return (
    <div className="flex flex-wrap gap-1" style={{ minHeight: 200 }}>
      {positions.map((p) => {
        const weight = (p.value / total) * 100;
        const pnlPct = mode === 'day' ? (p.dayChangePct || 0) : p.pnlPct || 0;
        const isPositive = pnlPct >= 0;
        const bg = isPositive
          ? `rgba(16, 185, 129, ${Math.min(0.6, Math.abs(pnlPct) / 30 + 0.15)})`
          : `rgba(239, 68, 68, ${Math.min(0.6, Math.abs(pnlPct) / 30 + 0.15)})`;

        return (
          <div
            key={p.ticker}
            className="rounded flex flex-col items-center justify-center text-center cursor-pointer transition-opacity hover:opacity-80"
            style={{
              background: bg,
              flexBasis: `${Math.max(weight * 0.95, 8)}%`,
              flexGrow: weight,
              minWidth: 60,
              minHeight: 60,
              padding: '8px 4px',
            }}
          >
            <span className="font-bold text-sm text-white">{p.ticker}</span>
            <span className="text-xs text-white/80">{weight.toFixed(1)}%</span>
            <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-200' : 'text-red-200'}`}>
              {isPositive ? '+' : ''}{pnlPct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
