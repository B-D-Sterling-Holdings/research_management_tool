"""Compute portfolio risk metrics: volatility, max drawdown, Sharpe, VaR, beta, correlation matrix."""
import json
import sys
import numpy as np
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

def fetch_risk(holdings, lookback_days=252):
    tickers = [h["ticker"] for h in holdings]
    if len(tickers) < 1:
        return {"error": "Need at least 1 position"}

    end = datetime.now()
    start = end - timedelta(days=lookback_days + 60)

    # Download historical prices
    prices = {}
    for t in tickers:
        try:
            hist = yf.download(t, start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"),
                               progress=False, auto_adjust=False)
            if not hist.empty:
                if isinstance(hist.columns, pd.MultiIndex):
                    hist.columns = [c[0] for c in hist.columns]
                prices[t] = hist["Close"].dropna()
        except Exception:
            pass

    # Also fetch SPY for beta
    try:
        spy = yf.download("SPY", start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"),
                          progress=False, auto_adjust=False)
        if isinstance(spy.columns, pd.MultiIndex):
            spy.columns = [c[0] for c in spy.columns]
        spy_prices = spy["Close"].dropna()
    except Exception:
        spy_prices = pd.Series(dtype=float)

    valid_tickers = [t for t in tickers if t in prices and len(prices[t]) >= 60]
    if not valid_tickers:
        return {"error": "Insufficient price history", "metrics": None, "correlation": None}

    # Build returns dataframe
    returns_df = pd.DataFrame({t: prices[t].pct_change().dropna() for t in valid_tickers})
    returns_df = returns_df.dropna()
    returns_df = returns_df.tail(lookback_days)

    # Compute weights from holdings (using equal weight among valid tickers as approx)
    total_value = 0
    weights = {}
    for h in holdings:
        if h["ticker"] in valid_tickers:
            val = h["shares"] * h.get("price", h["cost_basis"])
            weights[h["ticker"]] = val
            total_value += val

    if total_value > 0:
        for t in weights:
            weights[t] /= total_value
    else:
        eq = 1.0 / len(valid_tickers)
        weights = {t: eq for t in valid_tickers}

    # Portfolio daily returns (constant-weight)
    weight_arr = np.array([weights.get(t, 0) for t in valid_tickers])
    port_returns = returns_df[valid_tickers].values @ weight_arr

    # Metrics
    ann_vol = float(np.std(port_returns) * np.sqrt(252)) if len(port_returns) > 1 else None
    mean_ret = float(np.mean(port_returns))
    sharpe = float((mean_ret / np.std(port_returns)) * np.sqrt(252)) if np.std(port_returns) > 0 else None

    # Max drawdown
    cum = np.cumprod(1 + port_returns)
    peak = np.maximum.accumulate(cum)
    drawdown = (cum - peak) / peak
    max_dd = float(np.min(drawdown)) if len(drawdown) > 0 else None

    # VaR 95%
    var_95_pct = float(np.percentile(port_returns, 5)) if len(port_returns) > 20 else None

    # Beta vs SPY
    beta = None
    if not spy_prices.empty:
        spy_ret = spy_prices.pct_change().dropna()
        common_idx = returns_df.index.intersection(spy_ret.index)
        if len(common_idx) > 60:
            spy_common = spy_ret.loc[common_idx].values
            port_common = pd.Series(port_returns, index=returns_df.index).loc[common_idx].values
            cov = np.cov(port_common, spy_common)
            if cov[1, 1] > 0:
                beta = float(cov[0, 1] / cov[1, 1])

    # Correlation matrix
    corr = returns_df[valid_tickers].corr()
    corr_matrix = {
        "tickers": valid_tickers,
        "matrix": corr.values.tolist(),
    }

    return {
        "metrics": {
            "volatility": round(ann_vol * 100, 2) if ann_vol else None,
            "maxDrawdown": round(max_dd * 100, 2) if max_dd else None,
            "sharpe": round(sharpe, 2) if sharpe else None,
            "var95Pct": round(var_95_pct * 100, 2) if var_95_pct else None,
            "beta": round(beta, 2) if beta else None,
            "daysUsed": len(port_returns),
        },
        "correlation": corr_matrix,
    }

if __name__ == "__main__":
    holdings = json.loads(sys.argv[1])
    print(json.dumps(fetch_risk(holdings)))
