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
          backgroundColor: colors,
          borderRadius: 3,
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
            backgroundColor: '#111',
            borderColor: '#2a2a2a',
            borderWidth: 1,
            titleColor: '#e8e8e8',
            bodyColor: '#a0a0a0',
            padding: 10,
            callbacks: {
              label: (ctx) => formatY ? formatY(ctx.parsed.y) : ctx.parsed.y.toFixed(2),
            },
          },
        },
        scales: {
          x: {
            grid: { color: '#1e1e1e' },
            ticks: { color: '#666', maxTicksLimit: 10, font: { size: 10 } },
            border: { color: '#1e1e1e' },
          },
          y: {
            grid: { color: '#1e1e1e' },
            ticks: {
              color: '#666',
              font: { size: 10 },
              callback: formatY || ((v) => v),
            },
            border: { color: '#1e1e1e' },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [labels, data, label, formatY, colorPositive, colorNegative]);

  if (!data || !data.length) {
    return <div className="text-[#666] text-sm text-center py-8">No data available</div>;
  }

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
