'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, AlertTriangle } from 'lucide-react';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import LineChart from '@/components/charts/LineChart';
import BarChart from '@/components/charts/BarChart';
import ConfirmModal from '@/components/ConfirmModal';
import Toast from '@/components/Toast';
import { formatMoney, formatLargeNumber, formatShareCount, formatNumber } from '@/lib/formatters';

export default function ResearchPage() {
  const [portfolio, setPortfolio] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [tickerData, setTickerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Load portfolio holdings
  useEffect(() => {
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        setPortfolio(data);
        setLoading(false);
        // Auto-select first ticker
        if (data.holdings?.length && !selectedTicker) {
          setSelectedTicker(data.holdings[0].ticker);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  // Load ticker data when selection changes
  const loadTickerData = useCallback(async (ticker) => {
    if (!ticker) return;
    setTickerLoading(true);
    try {
      const res = await fetch(`/api/ticker/${ticker}`);
      const data = await res.json();
      setTickerData(data);
    } catch (e) {
      setToast({ message: `Failed to load data for ${ticker}`, type: 'error' });
    } finally {
      setTickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicker) loadTickerData(selectedTicker);
  }, [selectedTicker, loadTickerData]);

  const generateData = async () => {
    setGenerating(true);
    setShowGenerateModal(false);
    setShowUpdateModal(false);
    setToast({ message: `Generating data for ${selectedTicker}... This may take ~30 seconds.`, type: 'info' });
    try {
      const res = await fetch('/api/generate-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: selectedTicker }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: `Data generated for ${selectedTicker}!`, type: 'success' });
        loadTickerData(selectedTicker);
      } else {
        setToast({ message: `Error: ${data.error}`, type: 'error' });
      }
    } catch (e) {
      setToast({ message: `Generation failed: ${e.message}`, type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="skeleton h-12 w-64 rounded mb-6" />
        <div className="skeleton h-96 rounded-lg" />
      </div>
    );
  }

  const holdings = portfolio?.holdings || [];
  const cashVal = portfolio?.cash || 0;
  const totalAum = holdings.reduce((s, h) => s + h.shares * h.cost_basis, 0) + cashVal;

  // Selected holding info
  const holding = holdings.find(h => h.ticker === selectedTicker);
  const holdingValue = holding ? holding.shares * holding.cost_basis : 0;
  const pctAum = totalAum > 0 ? ((holdingValue / totalAum) * 100).toFixed(1) : '0.0';

  // Data availability
  const dataExists = tickerData?.dataExists;

  // Chart data preparation
  const makeQuarterLabel = (row) => `${row.quarter}'${String(row.year).slice(-2)}`;

  const revenueLabels = tickerData?.revenue?.map(makeQuarterLabel) || [];
  const revenueData = tickerData?.revenue?.map(r => r.revenue) || [];

  const epsLabels = tickerData?.eps?.map(makeQuarterLabel) || [];
  const epsData = tickerData?.eps?.map(e => e.eps_diluted) || [];

  const fcfLabels = tickerData?.fcf?.map(makeQuarterLabel) || [];
  const fcfData = tickerData?.fcf?.map(f => f.free_cash_flow) || [];

  const marginLabels = tickerData?.operating_margins?.map(makeQuarterLabel) || [];
  const marginData = tickerData?.operating_margins?.map(m => m.operating_margin * 100) || [];

  const sharesLabels = tickerData?.buybacks?.map(makeQuarterLabel) || [];
  const sharesData = tickerData?.buybacks?.map(b => b.shares_outstanding) || [];

  const priceLabels = tickerData?.daily_prices?.map(p => p.date) || [];
  const priceData = tickerData?.daily_prices?.map(p => p.close) || [];

  // PE ratio and FCF yield history from valuation
  const peLabels = tickerData?.valuation?.peHistory?.map(makeQuarterLabel) || [];
  const peData = tickerData?.valuation?.peHistory?.map(p => p.pe_ratio) || [];

  const fcfYieldLabels = tickerData?.valuation?.fcfYieldHistory?.map(makeQuarterLabel) || [];
  const fcfYieldData = tickerData?.valuation?.fcfYieldHistory?.map(f => f.fcf_yield) || [];

  const valuation = tickerData?.valuation || {};

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e8e8e8]">Research Management</h1>
          <p className="text-sm text-[#666] mt-1">Analyze company fundamentals for your holdings</p>
        </div>
        {dataExists && (
          <button
            onClick={() => setShowUpdateModal(true)}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-[#2a2a2a] rounded-md text-[#a0a0a0] hover:text-[#e8e8e8] hover:border-[#4a9eff] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
            Update Data
          </button>
        )}
      </div>

      {/* Ticker Selector */}
      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <label className="text-xs text-[#666] uppercase tracking-wider font-semibold">Select Company</label>
          <select
            value={selectedTicker}
            onChange={e => setSelectedTicker(e.target.value)}
            className="bg-[#0a0a0a] border border-[#1e1e1e] rounded px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#4a9eff] transition-colors min-w-[200px]"
          >
            <option value="">-- Select Ticker --</option>
            {holdings.map(h => (
              <option key={h.ticker} value={h.ticker}>{h.ticker}</option>
            ))}
          </select>
        </div>
      </Card>

      {!selectedTicker ? (
        <div className="text-center py-16 text-[#666]">
          <p className="text-lg mb-2">Select a ticker to view research data</p>
          <p className="text-sm">Choose from your portfolio holdings above</p>
        </div>
      ) : tickerLoading ? (
        <div className="space-y-4">
          <div className="skeleton h-24 rounded-lg" />
          <div className="skeleton h-64 rounded-lg" />
        </div>
      ) : !dataExists ? (
        /* No data - prompt to generate */
        <Card className="text-center py-12">
          <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#e8e8e8] mb-2">
            No data generated for {selectedTicker}
          </h2>
          <p className="text-sm text-[#a0a0a0] mb-6 max-w-md mx-auto">
            Data for this ticker has not been generated yet. Would you like to fetch fundamentals
            from Alpha Vantage and price data from Yahoo Finance?
          </p>
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={generating}
            className="px-6 py-2.5 bg-[#4a9eff] text-black font-semibold rounded-md hover:bg-[#3b8de6] transition-colors disabled:opacity-40"
          >
            {generating ? 'Generating...' : 'Generate Data'}
          </button>
        </Card>
      ) : (
        /* Data exists - render all charts */
        <>
          {/* Position Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Current % of AUM" value={`${pctAum}%`} color="blue" />
            <StatCard
              label="Cost Value"
              value={formatMoney(holdingValue)}
              sub={holding ? `${holding.shares.toFixed(4)} shares × $${holding.cost_basis.toFixed(2)}` : ''}
              color="blue"
            />
            <StatCard label="Ticker" value={selectedTicker} color="blue" />
          </div>

          {/* Price Chart */}
          <Card title="Price" className="mb-4">
            <LineChart
              labels={priceLabels}
              data={priceData}
              label="Price"
              color="#4a9eff"
              formatY={(v) => `$${v.toFixed(2)}`}
            />
          </Card>

          {/* Data Points */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4">
              <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Price</p>
              <p className="text-lg font-bold text-[#e8e8e8]">
                {valuation.currentPrice ? `$${Number(valuation.currentPrice).toFixed(2)}` : '—'}
              </p>
            </div>
            <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4">
              <p className="text-xs text-[#666] uppercase tracking-wider mb-1">PE Ratio</p>
              <p className="text-lg font-bold text-[#e8e8e8]">
                {valuation.peRatio ? formatNumber(valuation.peRatio, 1) : '—'}
              </p>
            </div>
            <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4">
              <p className="text-xs text-[#666] uppercase tracking-wider mb-1">FCF Yield</p>
              <p className="text-lg font-bold text-[#e8e8e8]">
                {valuation.fcfYield ? `${Number(valuation.fcfYield).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4">
              <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Price / Sales</p>
              <p className="text-lg font-bold text-[#e8e8e8]">
                {valuation.priceToSales ? formatNumber(valuation.priceToSales, 1) : '—'}
              </p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card title="Revenue">
              <BarChart
                labels={revenueLabels}
                data={revenueData}
                label="Revenue"
                formatY={(v) => formatLargeNumber(v)}
              />
            </Card>

            <Card title="Operating Margins">
              <LineChart
                labels={marginLabels}
                data={marginData}
                label="Op Margin"
                color="#f59e0b"
                formatY={(v) => `${v.toFixed(1)}%`}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card title="Outstanding Shares">
              <BarChart
                labels={sharesLabels}
                data={sharesData}
                label="Shares"
                formatY={(v) => formatShareCount(v)}
                colorPositive="#4a9eff"
                colorNegative="#4a9eff"
              />
            </Card>

            <Card title="EPS (Diluted)">
              <BarChart
                labels={epsLabels}
                data={epsData}
                label="EPS"
                formatY={(v) => `$${v.toFixed(2)}`}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card title="Free Cash Flow">
              <BarChart
                labels={fcfLabels}
                data={fcfData}
                label="FCF"
                formatY={(v) => formatLargeNumber(v)}
              />
            </Card>

            <Card title="PE Ratio">
              <LineChart
                labels={peLabels}
                data={peData}
                label="PE Ratio"
                color="#a78bfa"
                formatY={(v) => v.toFixed(1)}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card title="FCF Yield">
              <LineChart
                labels={fcfYieldLabels}
                data={fcfYieldData}
                label="FCF Yield"
                color="#10b981"
                formatY={(v) => `${v.toFixed(1)}%`}
              />
            </Card>
          </div>
        </>
      )}

      {/* Generate Data Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#e8e8e8] mb-2">Generate Data for {selectedTicker}</h3>
            <p className="text-sm text-[#a0a0a0] mb-4">
              This will fetch fundamental data from Alpha Vantage and price data from Yahoo Finance.
              The data will be saved locally so you only need to do this once.
            </p>
            <p className="text-xs text-amber-500 mb-4">
              Note: Alpha Vantage free tier allows 5 API calls/minute. Generation takes ~30 seconds due to rate limiting.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-sm border border-[#2a2a2a] rounded-md text-[#a0a0a0] hover:text-[#e8e8e8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={generateData}
                className="px-4 py-2 text-sm bg-[#4a9eff] text-black font-semibold rounded-md hover:bg-[#3b8de6] transition-colors"
              >
                Generate Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Data Modal */}
      {showUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#e8e8e8] mb-2">Update Data for {selectedTicker}</h3>
            <p className="text-sm text-[#a0a0a0] mb-4">
              This will re-fetch the latest fundamental and price data from the APIs, overwriting the existing data.
              Use this after an earnings release or if the data is stale.
            </p>
            <p className="text-xs text-amber-500 mb-4">
              This will use your Alpha Vantage API quota. Are you sure?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="px-4 py-2 text-sm border border-[#2a2a2a] rounded-md text-[#a0a0a0] hover:text-[#e8e8e8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={generateData}
                className="px-4 py-2 text-sm bg-amber-500 text-black font-semibold rounded-md hover:bg-amber-600 transition-colors"
              >
                Update Data
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
