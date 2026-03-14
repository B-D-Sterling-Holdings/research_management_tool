import fs from 'fs';
import path from 'path';

const PORTFOLIO_PATH = path.join(process.cwd(), 'portfolio.json');

export function loadPortfolio() {
  try {
    const raw = fs.readFileSync(PORTFOLIO_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return {
      holdings: Array.isArray(data.holdings) ? data.holdings : [],
      cash: Number(data.cash) || 0,
    };
  } catch {
    return { holdings: [], cash: 0 };
  }
}

export function savePortfolio(portfolio) {
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2), 'utf-8');
}

export function addHolding(ticker, shares, costBasis) {
  const portfolio = loadPortfolio();
  const upper = ticker.trim().toUpperCase();
  const existing = portfolio.holdings.find(h => h.ticker === upper);
  const now = new Date().toISOString();

  if (existing) {
    existing.shares = shares;
    existing.cost_basis = costBasis;
    existing.updated_at = now;
  } else {
    portfolio.holdings.push({
      ticker: upper,
      shares,
      cost_basis: costBasis,
      added_at: now,
      updated_at: now,
    });
  }

  savePortfolio(portfolio);
  return portfolio;
}

export function removeHolding(ticker) {
  const portfolio = loadPortfolio();
  const upper = ticker.trim().toUpperCase();
  portfolio.holdings = portfolio.holdings.filter(h => h.ticker !== upper);
  savePortfolio(portfolio);
  return portfolio;
}

export function updateCash(cash) {
  const portfolio = loadPortfolio();
  portfolio.cash = Number(cash) || 0;
  savePortfolio(portfolio);
  return portfolio;
}
