'use client';

import { useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function LineChart({ labels, data, label = '', color = '#4a9eff', formatY, fillArea = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data || !data.length) return;

    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(1, color + '00');

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
            ticks: { color: '#666', maxTicksLimit: 8, font: { size: 10 } },
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
  }, [labels, data, label, color, formatY, fillArea]);

  if (!data || !data.length) {
    return <div className="text-[#666] text-sm text-center py-8">No data available</div>;
  }

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
