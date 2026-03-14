'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import Treemap from '@/components/Treemap';
import Toast from '@/components/Toast';
import { formatMoney, formatMoneyPrecise, formatPct } from '@/lib/formatters';

export default function HoldingsPage() {
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [treemapMode, setTreemapMode] = useState('alltime');

  // Form state
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [cash, setCash] = useState('');
  const [search, setSearch] = useState('');

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      setPortfolio(data);
      setCash(String(data.cash || 0));
    } catch (e) {
      setToast({ message: 'Failed to load portfolio', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  const addHolding = async (e) => {
    e.preventDefault();
    if (!ticker || !shares || !costBasis) return;
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, shares: Number(shares), cost_basis: Number(costBasis) }),
      });
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.portfolio);
        setTicker('');
        setShares('');
        setCostBasis('');
        setToast({ message: `Added ${ticker.toUpperCase()}`, type: 'success' });
      } else {
        setToast({ message: data.error, type: 'error' });
      }
    } catch (e) {
      setToast({ message: 'Failed to add holding', type: 'error' });
    }
  };

  const removeHolding = async (t) => {
    try {
      const res = await fetch(`/api/holdings?ticker=${t}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.portfolio);
        setToast({ message: `Removed ${t}`, type: 'success' });
      }
    } catch (e) {
      setToast({ message: 'Failed to remove holding', type: 'error' });
    }
  };

  const saveCash = async () => {
    try {
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cash: Number(cash) }),
      });
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.portfolio);
        setToast({ message: 'Cash updated', type: 'success' });
      }
    } catch (e) {
      setToast({ message: 'Failed to update cash', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-lg" />)}
        </div>
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  const holdings = portfolio?.holdings || [];
  const cashVal = portfolio?.cash || 0;

  // Compute portfolio metrics
  const totalCost = holdings.reduce((s, h) => s + (h.shares * h.cost_basis), 0);
  const totalValue = totalCost; // Would use live quotes in production
  const totalAum = totalValue + cashVal;
  const totalPnl = 0; // Would compute from live prices

  // Build positions for treemap
  const positions = holdings.map(h => {
    const value = h.shares * h.cost_basis;
    const pnlPct = 0; // Would compute from live prices
    return {
      ticker: h.ticker,
      value,
      shares: h.shares,
      costBasis: h.cost_basis,
      pnlPct,
      dayChangePct: 0,
    };
  });

  const filtered = holdings.filter(h =>
    !search || h.ticker.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e8e8e8]">Our Holdings</h1>
          <p className="text-sm text-[#666] mt-1">Track your positions and portfolio allocation</p>
        </div>
        <button
          onClick={loadPortfolio}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-[#2a2a2a] rounded-md text-[#a0a0a0] hover:text-[#e8e8e8] hover:border-[#4a9eff] transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total AUM" value={formatMoney(totalAum)} color="blue" />
        <StatCard label="Positions" value={holdings.length} color="blue" />
        <StatCard label="Cash" value={formatMoney(cashVal)} color="yellow" />
      </div>

      {/* Treemap */}
      <Card
        title="Position Heatmap"
        actions={
          <div className="flex gap-1">
            <button
              onClick={() => setTreemapMode('alltime')}
              className={`px-3 py-1 text-xs rounded border transition-colors ${treemapMode === 'alltime' ? 'border-[#4a9eff] text-[#4a9eff]' : 'border-[#1e1e1e] text-[#666] hover:text-[#a0a0a0]'}`}
            >
              All Time
            </button>
            <button
              onClick={() => setTreemapMode('day')}
              className={`px-3 py-1 text-xs rounded border transition-colors ${treemapMode === 'day' ? 'border-[#4a9eff] text-[#4a9eff]' : 'border-[#1e1e1e] text-[#666] hover:text-[#a0a0a0]'}`}
            >
              Day Change
            </button>
          </div>
        }
        className="mb-6"
      >
        <Treemap positions={positions} mode={treemapMode} />
      </Card>

      {/* Add Holding Form */}
      <Card title="Add Position" className="mb-6">
        <form onSubmit={addHolding} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-[#666] uppercase tracking-wider block mb-1">Ticker</label>
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#4a9eff] transition-colors"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-[#666] uppercase tracking-wider block mb-1">Shares</label>
            <input
              type="number"
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="100"
              step="0.0001"
              className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#4a9eff] transition-colors"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-[#666] uppercase tracking-wider block mb-1">Cost Basis ($)</label>
            <input
              type="number"
              value={costBasis}
              onChange={e => setCostBasis(e.target.value)}
              placeholder="150.00"
              step="0.01"
              className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#4a9eff] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 px-4 py-2 bg-[#4a9eff] text-black text-sm font-semibold rounded hover:bg-[#3b8de6] transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </form>

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[#1e1e1e]">
          <span className="text-xs text-[#666] uppercase tracking-wider">Cash</span>
          <span className="text-[#666]">$</span>
          <input
            type="number"
            value={cash}
            onChange={e => setCash(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveCash()}
            placeholder="0.00"
            step="0.01"
            className="w-32 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-3 py-1.5 text-sm text-[#e8e8e8] outline-none focus:border-[#4a9eff] transition-colors"
          />
          <span className="text-xs text-[#666]">Press Enter to save</span>
        </div>
      </Card>

      {/* Positions Table */}
      <Card
        title="Positions"
        actions={
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ticker..."
            className="w-40 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-3 py-1.5 text-sm text-[#e8e8e8] outline-none focus:border-[#4a9eff] transition-colors"
          />
        }
      >
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[#666] text-sm">
            No holdings yet. Add your first position above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e1e]">
                  <th className="text-left py-3 px-3 text-xs text-[#666] uppercase tracking-wider font-semibold">Symbol</th>
                  <th className="text-right py-3 px-3 text-xs text-[#666] uppercase tracking-wider font-semibold">Qty</th>
                  <th className="text-right py-3 px-3 text-xs text-[#666] uppercase tracking-wider font-semibold">Avg Cost</th>
                  <th className="text-right py-3 px-3 text-xs text-[#666] uppercase tracking-wider font-semibold">Value</th>
                  <th className="text-right py-3 px-3 text-xs text-[#666] uppercase tracking-wider font-semibold">% AUM</th>
                  <th className="text-right py-3 px-3 text-xs text-[#666] uppercase tracking-wider font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => {
                  const value = h.shares * h.cost_basis;
                  const weight = totalAum > 0 ? (value / totalAum) * 100 : 0;
                  return (
                    <tr key={h.ticker} className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors">
                      <td className="py-3 px-3">
                        <span className="bg-[#4a9eff]/10 text-[#4a9eff] font-bold text-xs px-2.5 py-1 rounded">
                          {h.ticker}
                        </span>
                      </td>
                      <td className="text-right py-3 px-3 text-[#e8e8e8]">{h.shares.toFixed(4)}</td>
                      <td className="text-right py-3 px-3 text-[#e8e8e8]">{formatMoneyPrecise(h.cost_basis)}</td>
                      <td className="text-right py-3 px-3 text-[#e8e8e8] font-medium">{formatMoney(value)}</td>
                      <td className="text-right py-3 px-3 text-[#a0a0a0]">{weight.toFixed(1)}%</td>
                      <td className="text-right py-3 px-3">
                        <button
                          onClick={() => removeHolding(h.ticker)}
                          className="text-[#666] hover:text-red-400 transition-colors p-1"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
