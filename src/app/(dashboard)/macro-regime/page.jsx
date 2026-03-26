'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Play, Zap, RefreshCw, Shield, Settings, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, AlertTriangle, Check, Loader2, Terminal,
} from 'lucide-react';
import Toast from '@/components/Toast';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const DEFAULT_CONFIG = {
  start_date: '2000-01-01', end_date: '2026-03-01', equity_ticker: 'SPY',
  forecast_horizon_months: 1, macro_lag_months: 1, momentum_window: 3,
  volatility_window: 3, regularization_C: 0.5, class_weight: null, max_iter: 1000,
  recency_halflife_months: 12, window_type: 'expanding', rolling_window_months: 120,
  min_train_months: 48, holdout_start: '2020-01-01', baseline_equity: 0.95,
  baseline_tbills: 0.05, min_weight: 0.10, max_weight: 0.97,
  allocation_steepness: 13.0, weight_smoothing_up: 0.98, weight_smoothing_down: 0.97,
  crash_overlay: true, vix_spike_threshold: 7.0, drawdown_defense_threshold: -10.0,
  credit_spike_threshold: 1.5,
};

const CONFIG_SECTIONS = [
  { label: 'Data', fields: [
    { key: 'start_date', label: 'Start', type: 'text' }, { key: 'end_date', label: 'End', type: 'text' },
    { key: 'equity_ticker', label: 'Ticker', type: 'text' }, { key: 'forecast_horizon_months', label: 'Horizon', type: 'number', step: 1, suffix: 'mo' },
  ]},
  { label: 'Features', fields: [
    { key: 'macro_lag_months', label: 'Macro Lag', type: 'number', step: 1, suffix: 'mo' },
    { key: 'momentum_window', label: 'Momentum', type: 'number', step: 1, suffix: 'mo' },
    { key: 'volatility_window', label: 'Volatility', type: 'number', step: 1, suffix: 'mo' },
  ]},
  { label: 'Model', fields: [
    { key: 'regularization_C', label: 'C', type: 'number', step: 0.05 },
    { key: 'max_iter', label: 'Iters', type: 'number', step: 100 },
  ]},
  { label: 'Training', fields: [
    { key: 'recency_halflife_months', label: 'Halflife', type: 'number', step: 1, suffix: 'mo' },
    { key: 'window_type', label: 'Window', type: 'select', options: ['expanding', 'rolling'] },
    { key: 'rolling_window_months', label: 'Rolling', type: 'number', step: 12, suffix: 'mo' },
    { key: 'min_train_months', label: 'Min Train', type: 'number', step: 6, suffix: 'mo' },
    { key: 'holdout_start', label: 'Holdout', type: 'text' },
  ]},
  { label: 'Allocation', fields: [
    { key: 'baseline_equity', label: 'Base Eq', type: 'number', step: 0.05 },
    { key: 'baseline_tbills', label: 'Base TB', type: 'number', step: 0.05 },
    { key: 'min_weight', label: 'Min', type: 'number', step: 0.05 },
    { key: 'max_weight', label: 'Max', type: 'number', step: 0.01 },
    { key: 'allocation_steepness', label: 'Steep', type: 'number', step: 0.5 },
    { key: 'weight_smoothing_up', label: 'Sm Up', type: 'number', step: 0.01 },
    { key: 'weight_smoothing_down', label: 'Sm Dn', type: 'number', step: 0.01 },
  ]},
  { label: 'Crash Overlay', fields: [
    { key: 'crash_overlay', label: 'Enable', type: 'toggle' },
    { key: 'vix_spike_threshold', label: 'VIX', type: 'number', step: 0.5 },
    { key: 'drawdown_defense_threshold', label: 'DD', type: 'number', step: 1, suffix: '%' },
    { key: 'credit_spike_threshold', label: 'Credit', type: 'number', step: 0.1 },
  ]},
];

const fp = (v, d = 2) => { if (v == null) return '--'; const n = Number(v); return isFinite(n) ? `${(n * 100).toFixed(d)}%` : String(v); };
const fn = (v, d = 2) => { if (v == null) return '--'; const n = Number(v); return isFinite(n) ? n.toFixed(d) : String(v); };
const fd = (d) => { if (!d) return '--'; const s = String(d); return s.length >= 10 ? s.slice(0, 7) : s; };

function drawdowns(rows, key) {
  let peak = 0;
  return rows.map((r) => {
    const v = r[key];
    if (v == null) return null;
    if (v > peak) peak = v;
    return peak > 0 ? (v / peak - 1) : 0;
  });
}

function rollingSharpe(rows, key, w = 24) {
  const rets = rows.map((r) => r[key]);
  return rets.map((_, i) => {
    if (i < w) return null;
    const s = rets.slice(i - w, i).filter((v) => v != null);
    if (s.length < w * 0.75) return null;
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
    return sd > 0 ? (m * 12) / (sd * Math.sqrt(12)) : 0;
  });
}

const CL = { m: '#10b981', b: '#3b82f6', s: '#f59e0b', e: '#8b5cf6', t: '#d1d5db', r: '#ef4444' };

function co(yf = 'num') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 5, font: { size: 10 }, padding: 12, color: '#4b5563' },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#111',
        bodyColor: '#4b5563',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 8,
        callbacks: { label: (ctx) => {
          const v = ctx.parsed.y;
          if (yf === 'pct') return `${ctx.dataset.label}: ${(v * 100).toFixed(2)}%`;
          if (yf === '$') return `${ctx.dataset.label}: $${v.toFixed(0)}`;
          return `${ctx.dataset.label}: ${v.toFixed(2)}`;
        }},
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 9 }, color: '#9ca3af' } },
      y: {
        grid: { color: '#f3f4f6' },
        ticks: {
          font: { size: 9 },
          color: '#9ca3af',
          callback: (v) => yf === 'pct' ? `${(v * 100).toFixed(0)}%` : yf === '$' ? `$${v.toFixed(0)}` : v.toFixed(1),
        },
      },
    },
    elements: { point: { radius: 0, hoverRadius: 3 }, line: { tension: 0.3, borderWidth: 1.5 } },
  };
}

function mkds(label, data, color, fill = false, dash) {
  return { label, data, borderColor: color, backgroundColor: fill ? `${color}10` : 'transparent', fill, borderDash: dash, borderWidth: 1.5 };
}

const b01 = (o) => ({ ...o, scales: { ...o.scales, y: { ...o.scales.y, min: 0, max: 1 } } });

const RS = {
  'RISK ON': { bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50', border: 'border-emerald-200', icon: TrendingUp, label: 'Risk On' },
  'CAUTIOUS': { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, label: 'Cautious' },
  'RISK OFF': { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50', border: 'border-red-200', icon: TrendingDown, label: 'Risk Off' },
};

const METRICS = [
  { k: 'cagr', l: 'CAGR', f: 'p' }, { k: 'total_return', l: 'Total Return', f: 'p' },
  { k: 'volatility', l: 'Volatility', f: 'p' }, { k: 'sharpe', l: 'Sharpe', f: 'n' },
  { k: 'sortino', l: 'Sortino', f: 'n' }, { k: 'calmar', l: 'Calmar', f: 'n' },
  { k: 'max_drawdown', l: 'Max DD', f: 'p' }, { k: 'max_dd_duration', l: 'DD Duration', f: 'm' },
  { k: 'hit_rate', l: 'Hit Rate', f: 'p' }, { k: 'best_month', l: 'Best Mo', f: 'p' },
  { k: 'worst_month', l: 'Worst Mo', f: 'p' }, { k: 'up_down_ratio', l: 'Up/Down', f: 'n' },
];

function CfgField({ field, value, onChange }) {
  const { key, label, type, step, suffix, options } = field;
  if (type === 'toggle') return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-[11px] text-gray-500">{label}</span>
      <button
        type="button"
        onClick={() => onChange(key, !value)}
        className={`relative h-[18px] w-8 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${value ? 'left-[15px]' : 'left-[2px]'}`} />
      </button>
    </label>
  );
  if (type === 'select') return (
    <div>
      <label className="mb-1 block text-[10px] text-gray-400">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(key, e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-700 focus:border-emerald-300 focus:outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  return (
    <div>
      <label className="mb-1 block text-[10px] text-gray-400">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value ?? ''}
          step={step}
          onChange={(e) => {
            let v = e.target.value;
            if (type === 'number' && v !== '') v = Number(v);
            onChange(key, v);
          }}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-8 text-[11px] text-gray-700 focus:border-emerald-300 focus:outline-none"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-gray-300">{suffix}</span>}
      </div>
    </div>
  );
}

function MdRender({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  const out = [];
  let tbl = [];
  let inTbl = false;
  let k = 0;
  const flush = () => {
    if (!tbl.length) return;
    const hdr = tbl[0];
    const body = tbl.slice(1);
    out.push(
      <div key={k++} className="my-3 overflow-x-auto rounded-2xl border border-gray-100">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {hdr.map((c, i) => <th key={i} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{c.trim()}</th>)}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-50">
                {row.map((c, ci) => {
                  const t = c.trim();
                  const num = /^[+-]?[\d.]+%?$/.test(t);
                  return <td key={ci} className={`whitespace-nowrap px-3 py-2 ${num ? 'font-mono text-gray-500' : ci === 0 ? 'font-medium text-gray-700' : 'text-gray-500'}`}>{t || '--'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tbl = [];
  };
  for (const l of lines) {
    if (/^\|[\s:|-]+\|$/.test(l)) continue;
    if (l.startsWith('|') && l.endsWith('|')) { inTbl = true; tbl.push(l.slice(1, -1).split('|')); continue; }
    if (inTbl) { flush(); inTbl = false; }
    if (l.startsWith('# ')) out.push(<h1 key={k++} className="mb-2 mt-5 text-base font-bold text-gray-900">{l.slice(2)}</h1>);
    else if (l.startsWith('## ')) out.push(<h2 key={k++} className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">{l.slice(3)}</h2>);
    else if (l.startsWith('### ')) out.push(<h3 key={k++} className="mb-1 mt-3 text-xs font-semibold text-gray-700">{l.slice(4)}</h3>);
    else if (l.startsWith('*') && !l.startsWith('**') && l.endsWith('*')) out.push(<p key={k++} className="text-[10px] italic text-gray-400">{l.slice(1, -1)}</p>);
    else if (l.startsWith('- ') || l.startsWith('* ')) out.push(<li key={k++} className="ml-4 list-disc text-[11px] text-gray-500">{l.slice(2)}</li>);
    else if (l.trim()) out.push(<p key={k++} className="mb-1 text-[11px] text-gray-500">{l}</p>);
  }
  if (inTbl) flush();
  return <div>{out}</div>;
}

function SectionCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{title}</div>}
          {subtitle && <div className="mt-1 text-sm text-gray-600">{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export default function MacroRegimePage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [results, setResults] = useState(null);
  const [predict, setPredict] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [runStatus, setRunStatus] = useState({ running: false });
  const [runLog, setRunLog] = useState('');
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [btTab, setBtTab] = useState('performance');
  const [toast, setToast] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [historyLog, setHistoryLog] = useState(null);
  const logRef = useRef(null);
  const pollRef = useRef(null);

  const loadResults = useCallback(async () => {
    try {
      const r = await fetch('/api/macro-regime/results');
      const d = await r.json();
      if (d.backtest) setResults(d);
    } catch {}
  }, []);

  const loadPredict = useCallback(async (fresh = false) => {
    setPredictLoading(true);
    try {
      const r = fresh ? await fetch('/api/macro-regime/predict', { method: 'POST' }) : await fetch('/api/macro-regime/predict');
      const d = await r.json();
      if (!d.error) setPredict(d);
      else if (d.needsBacktest) setPredict(null);
    } catch {}
    setPredictLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [configData, resultsData, predictData, runData] = await Promise.all([
          fetch('/api/macro-regime/config').then((r) => r.json()),
          fetch('/api/macro-regime/results').then((r) => r.json()),
          fetch('/api/macro-regime/predict').then((r) => r.json()),
          fetch('/api/macro-regime/run').then((r) => r.json()),
        ]);

        if (cancelled) return;

        if (configData.config) setConfig({ ...DEFAULT_CONFIG, ...configData.config });
        if (resultsData.backtest) setResults(resultsData);
        if (!predictData.error) setPredict(predictData);
        else if (predictData.needsBacktest) setPredict(null);
        if (runData.history) setRunHistory(runData.history);
        if (runData.running) {
          setRunStatus(runData);
          setRunLog(runData.log || '');
          setShowLog(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!runStatus.running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/macro-regime/run');
        const d = await r.json();
        setRunLog(d.log || '');
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        if (!d.running) {
          setRunStatus(d);
          if (d.history) setRunHistory(d.history);
          clearInterval(pollRef.current);
          await Promise.all([loadResults(), loadPredict(false)]);
          setToast({ message: d.exitCode === 0 ? 'Completed' : `Failed (exit ${d.exitCode})`, type: d.exitCode === 0 ? 'success' : 'error' });
        }
      } catch {}
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runStatus.running, loadResults, loadPredict]);

  const handleRun = async (cmd) => {
    try {
      const r = await fetch('/api/macro-regime/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd }) });
      const d = await r.json();
      if (d.error) { setToast({ message: d.error, type: 'error' }); return; }
      setRunStatus({ running: true, command: cmd });
      setRunLog('');
      setShowLog(true);
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const saveConfig = async () => {
    try {
      const r = await fetch('/api/macro-regime/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
      const d = await r.json();
      setToast({ message: d.error || 'Saved', type: d.error ? 'error' : 'success' });
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const viewLog = async (id) => {
    if (historyLog?.id === id) { setHistoryLog(null); return; }
    try {
      const r = await fetch(`/api/macro-regime/run?history=${id}`);
      const d = await r.json();
      if (d.run) setHistoryLog(d.run);
    } catch {}
  };

  // Deduplicate backtest rows: the CSV can have two rows with the same date
  // (e.g. Feb's realized return lands on the same date as Mar's unrealized
  // prediction). Keep only the row with the latest rebalance_date per date.
  const btRaw = results?.backtest || [];
  const btByDate = new Map();
  for (const row of btRaw) {
    const key = row.date;
    const existing = btByDate.get(key);
    if (!existing || (row.rebalance_date || '') > (existing.rebalance_date || '')) {
      btByDate.set(key, row);
    }
  }
  const bt = [...btByDate.values()];
  const metrics = results?.metrics || [];
  const sig = predict;
  const mm = metrics.find((m) => m.label === 'Model Portfolio');
  const em = metrics.find((m) => m.label && m.label.includes('Equity'));
  const step = bt.length > 400 ? 2 : 1;
  const cr = bt.filter((_, i) => i % step === 0 || i === bt.length - 1);
  const lbl = cr.map((r) => fd(r.date));

  if (loading) return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="mb-6 h-6 w-48 rounded skeleton" />
      <div className="h-64 rounded-2xl skeleton" />
    </div>
  );

  const reg = sig ? RS[sig.regime] || RS.CAUTIOUS : null;
  const RegIcon = reg?.icon || TrendingUp;
  const eq = Math.round((sig?.equityWeight || 0) * 100);
  const marketSignals = sig?.marketSignals ? Object.entries(sig.marketSignals) : [];
  const signalOverview = sig ? [
    {
      label: 'P(Equity > T-Bills)',
      value: sig.probEquity != null ? sig.probEquity.toFixed(2) : '--',
      detail: sig.probEquity != null ? `${Math.round(sig.probEquity * 100)}% confidence` : 'No probability',
      tone: (sig.probEquity || 0) >= 0.5 ? 'text-emerald-700' : 'text-red-600',
      bar: Math.max(0, Math.min(100, (sig.probEquity || 0) * 100)),
      barColor: (sig.probEquity || 0) >= 0.5 ? 'bg-emerald-500' : 'bg-red-500',
    },
    {
      label: 'Crash Overlay',
      value: sig.overlay === 'none' ? 'Clear' : (sig.overlay || '--'),
      detail: sig.overlay === 'none' ? 'No defense active' : 'Defense active',
      tone: sig.overlay === 'none' ? 'text-emerald-700' : 'text-red-600',
      bar: 100,
      barColor: sig.overlay === 'none' ? 'bg-emerald-500' : 'bg-red-500',
    },
    {
      label: 'Target Mix',
      value: `${eq}/${100 - eq}`,
      detail: `${eq}% equity, ${100 - eq}% T-Bills`,
      tone: 'text-gray-900',
      bar: eq,
      barColor: 'bg-gray-900',
    },
  ] : [];
  const proofPoints = mm && em ? [
    { label: 'CAGR', value: fp(mm.cagr), comp: fp(em.cagr), good: mm.cagr > em.cagr },
    { label: 'Sharpe', value: fn(mm.sharpe), comp: fn(em.sharpe), good: mm.sharpe > em.sharpe },
    { label: 'Max Drawdown', value: fp(mm.max_drawdown), comp: fp(em.max_drawdown), good: mm.max_drawdown > em.max_drawdown },
    { label: 'Sortino', value: fn(mm.sortino), comp: fn(em.sortino), good: mm.sortino > em.sortino },
  ] : [];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-gray-950">Macro Regime</h1>
          <p className="max-w-2xl text-sm text-gray-500">
            Current allocation, regime context, and backtest diagnostics in one view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runStatus.running && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700">
              <Loader2 size={10} className="animate-spin" /> {runStatus.command}
            </span>
          )}
          {[
            { cmd: 'predict', icon: Zap, tip: 'Predict' },
            { cmd: 'fast', icon: RefreshCw, tip: 'Fast Backtest' },
            { cmd: 'run', icon: Play, tip: 'Full Backtest' },
            { cmd: 'validate', icon: Shield, tip: 'Validate' },
          ].map(({ cmd, icon: I, tip }) => (
            <button
              key={cmd}
              onClick={() => handleRun(cmd)}
              disabled={runStatus.running}
              title={tip}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <I size={13} />
              <span className="hidden sm:inline">{tip}</span>
            </button>
          ))}
          <button
            onClick={() => setShowLog((v) => !v)}
            title="Toggle log"
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-medium transition-all ${showLog ? 'border-gray-300 bg-gray-100 text-gray-900' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800'}`}
          >
            <Terminal size={13} />
            <span className="hidden sm:inline">Log</span>
          </button>
          <button
            onClick={() => setShowConfig((v) => !v)}
            title="Config"
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-medium transition-all ${showConfig ? 'border-gray-300 bg-gray-100 text-gray-900' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800'}`}
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Config</span>
          </button>
        </div>
      </div>

      {showLog && (
        <SectionCard title="Run Log" subtitle="Recent job output and saved run history." className="mb-5">
          <div ref={logRef} className="max-h-52 overflow-y-auto rounded-2xl bg-gray-950 px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-gray-300">
            {runLog || 'No output yet.'}
          </div>
          {runHistory.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {runHistory.map((r) => (
                <button
                  key={r.id}
                  onClick={() => viewLog(r.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-[10px] text-gray-500 transition-colors hover:bg-gray-50"
                >
                  <span className={`h-1 w-1 rounded-full ${r.status === 'completed' ? 'bg-emerald-400' : r.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  {r.run_type}
                </button>
              ))}
            </div>
          )}
          {historyLog && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-2xl bg-gray-950 p-3 font-mono text-[10px] whitespace-pre-wrap text-gray-400">
              {historyLog.log_output || 'No log saved.'}
            </div>
          )}
        </SectionCard>
      )}

      {showConfig && (
        <SectionCard title="Configuration" subtitle="Presentation updated only. Existing parameters and actions are unchanged." className="mb-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {CONFIG_SECTIONS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{s.label}</div>
                <div className="space-y-1.5">
                  {s.fields.map((f) => <CfgField key={f.key} field={f} value={config[f.key]} onChange={(k, v) => setConfig((p) => ({ ...p, [k]: v }))} />)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button onClick={() => setConfig(DEFAULT_CONFIG)} className="rounded-xl px-3 py-2 text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700">Reset</button>
            <button onClick={saveConfig} className="inline-flex items-center gap-1 rounded-xl bg-gray-900 px-3 py-2 text-[11px] font-medium text-white hover:bg-gray-800">
              <Check size={9} /> Save
            </button>
          </div>
        </SectionCard>
      )}

      {sig ? (
        <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.9fr)]">
          <div className={`overflow-hidden rounded-[28px] border ${reg.border} bg-gradient-to-br from-white via-white to-gray-50 shadow-sm`}>
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)]">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={`inline-flex items-center gap-2 rounded-full ${reg.bg} px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white`}>
                    <RegIcon size={14} />
                    {reg.label}
                  </div>
                  <div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-500">
                    Allocation for {sig.allocationFor || '--'}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
                  <div className="flex items-end gap-3">
                    <span className="text-6xl font-semibold leading-none tracking-tight text-gray-950 tabular-nums sm:text-7xl">{eq}</span>
                    <span className="pb-2 text-sm font-medium text-gray-400">% equity</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-[11px] text-gray-500">
                        <span>Portfolio mix</span>
                        <span className="font-medium text-gray-700 tabular-nums">{eq}% / {100 - eq}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-gray-200/70">
                        <div className="flex h-full">
                          <div className="h-full bg-gray-900 transition-all duration-500" style={{ width: `${eq}%` }} />
                          <div className="h-full bg-gray-300 transition-all duration-500" style={{ width: `${100 - eq}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Equity</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900 tabular-nums">{eq}%</div>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">T-Bills</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900 tabular-nums">{100 - eq}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                  <span>Data as of {sig.dataAsOf || '--'}</span>
                  <span className="hidden text-gray-300 sm:inline">•</span>
                  <span>Regime source: live model signal</span>
                </div>
              </div>

              <div className="grid gap-3 self-start">
                {signalOverview.map(({ label, value, detail, tone, bar, barColor }) => (
                  <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
                      <div className={`text-right text-2xl font-semibold tracking-tight tabular-nums ${tone}`}>{value}</div>
                    </div>
                    <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${bar}%` }} />
                    </div>
                    <div className="text-xs text-gray-500">{detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SectionCard title="Market Signals" subtitle="Underlying directional inputs from the latest read.">
            <div className="mb-4 flex items-center justify-end">
              <div className="rounded-full border border-gray-200 px-2.5 py-1 text-[10px] text-gray-500">{marketSignals.length} inputs</div>
            </div>
            {marketSignals.length > 0 ? (
              <div className="space-y-2">
                {marketSignals.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                    <span className="min-w-0 truncate text-sm text-gray-600">{k.replace(/_/g, ' ')}</span>
                    <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {v > 0 ? '+' : ''}{fn(v)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                No market signals available.
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => loadPredict(true)}
                disabled={predictLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:opacity-30"
              >
                <RefreshCw size={10} className={predictLoading ? 'animate-spin' : ''} />
                Refresh signal
              </button>
            </div>
          </SectionCard>
        </div>
      ) : (
        <div className="mb-5 rounded-[28px] border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center">
          {predictLoading
            ? <Loader2 size={20} className="mx-auto animate-spin text-gray-300" />
            : <>
                <p className="text-sm text-gray-500">No signal available</p>
                <p className="mt-1 text-xs text-gray-400">Run a backtest, then predict to see the current allocation.</p>
              </>}
        </div>
      )}

      <div className="mb-5 grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        {cr.length > 0 && (
          <SectionCard title="Allocation Over Time" subtitle="Stepped exposure between equity and T-Bills across the backtest.">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Equity
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                  <span className="h-2 w-2 rounded-full bg-blue-400" />
                  T-Bills
                </div>
              </div>
            </div>
            <div className="h-72">
              <Line
                data={{
                  labels: lbl,
                  datasets: [
                    {
                      label: 'Equity',
                      data: cr.map((r) => r.weight_equity),
                      borderColor: '#111827',
                      backgroundColor: 'rgba(17, 24, 39, 0.14)',
                      fill: true,
                      stepped: 'before',
                      borderWidth: 1.5,
                      pointRadius: 0,
                      pointHoverRadius: 3,
                    },
                    {
                      label: 'T-Bills',
                      data: cr.map((r) => r.weight_equity != null ? 1 : null),
                      borderColor: 'transparent',
                      backgroundColor: 'rgba(148, 163, 184, 0.14)',
                      fill: true,
                      stepped: 'before',
                      borderWidth: 0,
                      pointRadius: 0,
                      pointHoverRadius: 0,
                    },
                  ],
                }}
                options={{
                  ...b01(co('pct')),
                  plugins: {
                    ...b01(co('pct')).plugins,
                    legend: { display: false },
                    tooltip: {
                      ...b01(co('pct')).plugins.tooltip,
                      callbacks: {
                        label: (ctx) => {
                          if (ctx.datasetIndex === 1) return null;
                          const eqWeight = ctx.parsed.y;
                          return [`Equity: ${(eqWeight * 100).toFixed(1)}%`, `T-Bills: ${((1 - eqWeight) * 100).toFixed(1)}%`];
                        },
                      },
                      filter: (item) => item.datasetIndex === 0,
                    },
                  },
                }}
              />
            </div>
          </SectionCard>
        )}

        {proofPoints.length > 0 && (
          <SectionCard title="At A Glance" subtitle="Key model-vs-equity proof points from the latest backtest.">
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
              {proofPoints.map(({ label, value, comp, good }) => (
                <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">{value}</div>
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      vs {comp}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      {results && (
        <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm">
          <button
            onClick={() => setShowBacktest((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-gray-50/70 sm:px-6"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-700">Backtest & Analysis</span>
            {showBacktest ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </button>

          {showBacktest && (
            <>
              <div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 pb-3 sm:px-6">
                {[
                  { id: 'performance', label: 'Performance' },
                  { id: 'charts', label: 'Charts' },
                  ...(results.plots?.length ? [{ id: 'plots', label: 'Plots' }] : []),
                  ...(results.validationReport ? [{ id: 'validation', label: 'Validation' }] : []),
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setBtTab(id)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${btTab === id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-5 sm:p-6">
                {btTab === 'performance' && (
                  <div className="space-y-5">
                    <div className="rounded-3xl border border-gray-100 bg-gray-50/60 p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Cumulative Returns</div>
                      <div className="h-72">
                        <Line data={{ labels: lbl, datasets: [
                          mkds('Model', cr.map((r) => r.cum_port), CL.m),
                          mkds('95/5', cr.map((r) => r.cum_ew), CL.b, false, [4, 2]),
                          mkds('60/40', cr.map((r) => r.cum_6040), CL.s, false, [6, 3]),
                          mkds('Equity', cr.map((r) => r.cum_equity), CL.e, false, [2, 2]),
                        ] }} options={co('$')} />
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-100 bg-gray-50/60 p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Drawdowns</div>
                      <div className="h-44">
                        <Line data={{ labels: lbl, datasets: [
                          { ...mkds('Model', drawdowns(cr, 'cum_port'), CL.m, true), backgroundColor: `${CL.m}12` },
                          { ...mkds('Equity', drawdowns(cr, 'cum_equity'), CL.e, true), backgroundColor: `${CL.e}08` },
                        ] }} options={co('pct')} />
                      </div>
                    </div>

                    {metrics.length > 0 && (
                      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white">
                        <div className="border-b border-gray-100 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Metrics</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="w-28 py-3 pl-4 pr-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Metric</th>
                                {metrics.map((m) => (
                                  <th key={m.label} className={`px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] ${m.label === 'Model Portfolio' ? 'text-emerald-600' : 'text-gray-300'}`}>
                                    {m.label.replace(' Portfolio', '').replace(' Only', '')}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {METRICS.map(({ k, l, f }) => (
                                <tr key={k} className="border-b border-gray-50/60">
                                  <td className="py-2 pl-4 pr-3 font-medium text-gray-500">{l}</td>
                                  {metrics.map((m, j) => {
                                    const v = m[k];
                                    let d = '--';
                                    if (v != null) {
                                      if (f === 'p') d = fp(v);
                                      else if (f === 'n') d = fn(v);
                                      else d = `${Math.round(v)} mo`;
                                    }
                                    return <td key={m.label} className={`px-3 py-2 text-right font-mono ${j === 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>{d}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {btTab === 'charts' && (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-3xl border border-gray-100 bg-gray-50/60 p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Model Probabilities</div>
                      <div className="h-56">
                        <Line data={{ labels: lbl, datasets: [
                          mkds('P(Equity > TB)', cr.map((r) => r.prob_equity), CL.m),
                          mkds('P(TB Win)', cr.map((r) => r.prob_tbills), CL.r, false, [4, 2]),
                        ] }} options={b01(co('pct'))} />
                      </div>
                    </div>
                    <div className="rounded-3xl border border-gray-100 bg-gray-50/60 p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Rolling 24mo Sharpe</div>
                      <div className="h-56">
                        <Line data={{ labels: lbl, datasets: [
                          mkds('Model', rollingSharpe(cr, 'port_return'), CL.m),
                          mkds('Equity', rollingSharpe(cr, 'ret_equity'), CL.e, false, [4, 2]),
                        ] }} options={co('num')} />
                      </div>
                    </div>
                  </div>
                )}

                {btTab === 'plots' && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {(results.plots || []).map((p) => (
                      <div key={p} className="rounded-3xl border border-gray-100 bg-gray-50/60 p-4">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                          {p.replace(/_/g, ' ').replace('.png', '').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </div>
                        <Image
                          src={`/api/macro-regime/plots?name=${p}`}
                          alt={p}
                          width={1600}
                          height={900}
                          className="h-auto w-full rounded-2xl border border-gray-100"
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                )}

                {btTab === 'validation' && results.validationReport && (
                  <div>
                    <MdRender content={results.validationReport} />
                    {Object.entries(results.validationData || {}).map(([name, rows]) => {
                      if (!rows?.length) return null;
                      const cols = Object.keys(rows[0]);
                      return (
                        <div key={name} className="mt-6 overflow-hidden rounded-3xl border border-gray-100 bg-white">
                          <div className="border-b border-gray-100 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{name.replace(/_/g, ' ')}</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  {cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{c.replace(/_/g, ' ')}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, i) => (
                                  <tr key={i} className="border-b border-gray-50">
                                    {cols.map((c) => {
                                      const v = row[c];
                                      const isN = typeof v === 'number' && isFinite(v);
                                      return <td key={c} className={`whitespace-nowrap px-3 py-2 ${isN ? 'font-mono text-gray-500' : 'font-medium text-gray-600'}`}>{v == null ? '--' : isN ? fn(v, 3) : String(v)}</td>;
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!results && !sig && (
        <div className="py-12 text-center text-sm text-gray-400">
          Run a full backtest to get started.
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
