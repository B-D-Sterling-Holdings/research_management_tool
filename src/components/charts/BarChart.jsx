'use client';

import { useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function BarChart({ labels, data, label = '', formatY, colorPositive = '#10b981', colorNegative = '#ef4444' }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data || !data.length) return;

    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');

    const colors = data.map(v => v >= 0 ? colorPositive : colorNegative);

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: colors.map(c => c + '80'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            titleColor: '#111827',
            bodyColor: '#6b7280',
            padding: 12,
            cornerRadius: 12,
            boxPadding: 4,
            callbacks: {
              label: (ctx) => formatY ? formatY(ctx.parsed.y) : ctx.parsed.y.toFixed(2),
            },
          },
        },
        scales: {
          x: {
            grid: { color: '#f3f4f6' },
            ticks: { color: '#9ca3af', maxTicksLimit: 10, font: { size: 10, family: 'Plus Jakarta Sans' } },
            border: { color: '#e5e7eb' },
          },
          y: {
            grid: { color: '#f3f4f6' },
            ticks: {
              color: '#9ca3af',
              font: { size: 10, family: 'Plus Jakarta Sans' },
              callback: formatY || ((v) => v),
            },
            border: { color: '#e5e7eb' },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [labels, data, label, formatY, colorPositive, colorNegative]);

  if (!data || !data.length) {
    return <div className="text-gray-400 text-sm text-center py-8">No data available</div>;
  }

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
