'use client';

import { useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function LineChart({ labels, data, label = '', color = '#10b981', formatY, fillArea = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data || !data.length) return;

    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, color + '25');
    gradient.addColorStop(1, color + '02');

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: fillArea ? gradient : 'transparent',
          borderWidth: 2,
          fill: fillArea,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: color,
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
            ticks: { color: '#9ca3af', maxTicksLimit: 8, font: { size: 10, family: 'Plus Jakarta Sans' } },
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
  }, [labels, data, label, color, formatY, fillArea]);

  if (!data || !data.length) {
    return <div className="text-gray-400 text-sm text-center py-8">No data available</div>;
  }

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
