import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export function getTickerDataDir(ticker) {
  return path.join(DATA_DIR, ticker.toUpperCase());
}

export function tickerDataExists(ticker) {
  const dir = getTickerDataDir(ticker);
  const fundamentalsDir = path.join(dir, 'fundamentals');
  const priceDir = path.join(dir, 'price_data');

  if (!fs.existsSync(fundamentalsDir) || !fs.existsSync(priceDir)) return false;

  // Check if at least revenue.csv and daily_prices.csv exist
  const hasRevenue = fs.existsSync(path.join(fundamentalsDir, 'revenue.csv'));
  const hasPrices = fs.existsSync(path.join(priceDir, 'daily_prices.csv'));
  return hasRevenue && hasPrices;
}

export function readCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];
  const lines = content.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      const val = (values[i] || '').trim();
      const num = Number(val);
      row[h] = val !== '' && !isNaN(num) && h !== 'date' && h !== 'quarter' ? num : val;
    });
    return row;
  });
}

export function loadTickerFundamentals(ticker) {
  const dir = getTickerDataDir(ticker);
  const fundamentalsDir = path.join(dir, 'fundamentals');
  const priceDir = path.join(dir, 'price_data');

  return {
    revenue: readCSV(path.join(fundamentalsDir, 'revenue.csv')),
    eps: readCSV(path.join(fundamentalsDir, 'eps.csv')),
    fcf: readCSV(path.join(fundamentalsDir, 'fcf.csv')),
    operating_margins: readCSV(path.join(fundamentalsDir, 'operating_margins.csv')),
    buybacks: readCSV(path.join(fundamentalsDir, 'buybacks.csv')),
    daily_prices: readCSV(path.join(priceDir, 'daily_prices.csv')),
    market_data: readCSV(path.join(priceDir, 'market_data.csv')),
  };
}

export function getMarketDataPoint(marketData, metric) {
  const row = marketData.find(r => r.metric === metric);
  return row ? row.value : null;
}

// Compute PE ratio from price and EPS data
export function computeValuationMetrics(data) {
  const { daily_prices, eps, fcf, revenue, market_data } = data;

  const currentPrice = getMarketDataPoint(market_data, 'current_price')
    || (daily_prices.length ? daily_prices[daily_prices.length - 1].close : null);

  const latestEps = eps.length ? eps[eps.length - 1].eps_diluted : null;
  const latestFcf = fcf.length ? fcf[fcf.length - 1].free_cash_flow : null;
  const latestRevenue = revenue.length ? revenue[revenue.length - 1].revenue : null;

  // Shares outstanding from buybacks data (latest)
  const buybacks = data.buybacks || [];
  const latestShares = buybacks.length ? buybacks[buybacks.length - 1].shares_outstanding : null;

  const peRatio = (currentPrice && latestEps && latestEps !== 0) ? currentPrice / latestEps : null;
  const marketCap = (currentPrice && latestShares) ? currentPrice * latestShares : null;
  const fcfYield = (latestFcf && marketCap && marketCap !== 0) ? (latestFcf / marketCap) * 100 : null;
  const priceToSales = (marketCap && latestRevenue && latestRevenue !== 0) ? marketCap / latestRevenue : null;

  // Build PE ratio history from EPS + price data
  const peHistory = [];
  if (eps.length && daily_prices.length) {
    // Map EPS by quarter for lookup
    eps.forEach((e, idx) => {
      if (e.eps_diluted && e.eps_diluted !== 0) {
        // Find closest price to quarter end
        const label = `${e.quarter}'${String(e.year).slice(-2)}`;
        // Use the EPS value and try to find a matching price
        // Simple approach: use interpolated price from the price series
        const priceIdx = Math.floor((idx / eps.length) * daily_prices.length);
        const price = daily_prices[Math.min(priceIdx, daily_prices.length - 1)]?.close;
        if (price) {
          peHistory.push({ year: e.year, quarter: e.quarter, pe_ratio: price / e.eps_diluted });
        }
      }
    });
  }

  // Build FCF yield history
  const fcfYieldHistory = [];
  if (fcf.length && daily_prices.length && buybacks.length) {
    fcf.forEach((f, idx) => {
      const shares = buybacks[Math.min(idx, buybacks.length - 1)]?.shares_outstanding;
      const priceIdx = Math.floor((idx / fcf.length) * daily_prices.length);
      const price = daily_prices[Math.min(priceIdx, daily_prices.length - 1)]?.close;
      if (f.free_cash_flow && shares && price && shares !== 0) {
        const mc = price * shares;
        if (mc !== 0) {
          fcfYieldHistory.push({
            year: f.year,
            quarter: f.quarter,
            fcf_yield: (f.free_cash_flow / mc) * 100,
          });
        }
      }
    });
  }

  return {
    currentPrice,
    peRatio,
    fcfYield,
    priceToSales,
    peHistory,
    fcfYieldHistory,
    high52w: getMarketDataPoint(market_data, '52_week_high'),
    low52w: getMarketDataPoint(market_data, '52_week_low'),
    pctFrom52wHigh: getMarketDataPoint(market_data, 'pct_from_52week_high'),
  };
}
