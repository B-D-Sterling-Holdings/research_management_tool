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

    # Beta & Correlation vs SPY
    beta = None
    corr_spy = None
    if not spy_prices.empty:
        spy_ret = spy_prices.pct_change().dropna()
        common_idx = returns_df.index.intersection(spy_ret.index)
        if len(common_idx) > 60:
            spy_common = spy_ret.loc[common_idx].values
            port_common = pd.Series(port_returns, index=returns_df.index).loc[common_idx].values
            cov = np.cov(port_common, spy_common)
            if cov[1, 1] > 0:
                beta = float(cov[0, 1] / cov[1, 1])
            corr_matrix_spy = np.corrcoef(port_common.flatten(), spy_common.flatten())
            corr_spy = float(corr_matrix_spy[0, 1])

    # Correlation matrix
    corr = returns_df[valid_tickers].corr()
    asset_vols = returns_df[valid_tickers].std()

    # Implied portfolio correlation, weighted by covariance contribution.
    # This is a portfolio-level diversification statistic, not a simple
    # arithmetic average of pairwise correlations.
    portfolio_corr = None
    cross_scale = 0.0
    cross_corr = 0.0
    for i in range(len(valid_tickers)):
        for j in range(i + 1, len(valid_tickers)):
            ti = valid_tickers[i]
            tj = valid_tickers[j]
            scale = weights.get(ti, 0) * weights.get(tj, 0) * asset_vols[ti] * asset_vols[tj]
            cross_scale += scale
            cross_corr += scale * corr.loc[ti, tj]
    if cross_scale > 0:
        portfolio_corr = float(cross_corr / cross_scale)

    corr_matrix = {
        "tickers": valid_tickers,
        "matrix": corr.values.tolist(),
    }

    # === Risk Attribution ===
    # Covariance matrix (annualized)
    cov_matrix = returns_df[valid_tickers].cov().values * 252

    # Ensure positive semi-definite via eigenvalue clipping
    eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)
    if np.any(eigenvalues < 0):
        eigenvalues = np.maximum(eigenvalues, 0)
        cov_matrix = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T
        psd_adjusted = True
    else:
        psd_adjusted = False

    w = weight_arr
    sigma_w = cov_matrix @ w                     # Σw vector
    port_var = float(w @ sigma_w)                # wᵀΣw
    port_vol = float(np.sqrt(max(port_var, 0)))  # σ_p

    # Standalone annualized vol per asset
    standalone_vols = np.sqrt(np.diag(cov_matrix))

    # Risk contributions
    attribution = []
    for i, t in enumerate(valid_tickers):
        wi = float(w[i])
        sigma_wi = float(sigma_w[i])              # (Σw)_i
        mrc_i = sigma_wi / port_vol if port_vol > 0 else 0   # MRC_i
        rc_i = wi * mrc_i                         # RC_i = w_i * MRC_i
        pct_rc_i = rc_i / port_vol if port_vol > 0 else 0    # %RC_i

        # Weight vs risk contribution comparison
        diff = pct_rc_i - wi
        if diff > 0.01:
            risk_label = "over contributing"
        elif diff < -0.01:
            risk_label = "under contributing"
        else:
            risk_label = "in line"

        attribution.append({
            "ticker": t,
            "weight": round(wi * 100, 2),
            "standaloneVol": round(float(standalone_vols[i]) * 100, 2),
            "covWithPortfolio": round(sigma_wi * 100, 4),
            "marginalContrib": round(mrc_i * 100, 4),
            "totalContrib": round(rc_i * 100, 4),
            "pctOfTotalRisk": round(pct_rc_i * 100, 2),
            "riskLabel": risk_label,
        })

    # Sort by percent of total risk descending
    attribution.sort(key=lambda x: x["pctOfTotalRisk"], reverse=True)

    # Concentration metrics
    pct_rc_values = [a["pctOfTotalRisk"] for a in attribution]
    top3_risk = sum(pct_rc_values[:3]) if len(pct_rc_values) >= 3 else sum(pct_rc_values)
    top5_risk = sum(pct_rc_values[:5]) if len(pct_rc_values) >= 5 else sum(pct_rc_values)

    # Effective number of risk contributors: 1 / Σ(%RC_i as decimal)²
    pct_rc_dec = [p / 100 for p in pct_rc_values]
    eff_contributors = 1.0 / sum(x**2 for x in pct_rc_dec) if sum(x**2 for x in pct_rc_dec) > 0 else 0

    # Weights normalized flag
    raw_weight_sum = sum(weights.get(t, 0) for t in valid_tickers)
    weights_normalized = abs(raw_weight_sum - 1.0) > 0.01

    risk_attribution = {
        "stocks": attribution,
        "summary": {
            "portfolioVariance": round(port_var * 10000, 2),       # in bps²
            "portfolioVolatility": round(port_vol * 100, 2),       # annualized %
            "sumTotalContrib": round(sum(a["totalContrib"] for a in attribution), 4),
            "sumPctContrib": round(sum(a["pctOfTotalRisk"] for a in attribution), 2),
            "effectiveContributors": round(eff_contributors, 2),
            "top3RiskPct": round(top3_risk, 2),
            "top5RiskPct": round(top5_risk, 2),
            "weightsNormalized": weights_normalized,
            "psdAdjusted": psd_adjusted,
        },
    }

    return {
        "metrics": {
            "volatility": round(ann_vol * 100, 2) if ann_vol else None,
            "maxDrawdown": round(max_dd * 100, 2) if max_dd else None,
            "sharpe": round(sharpe, 2) if sharpe else None,
            "var95Pct": round(var_95_pct * 100, 2) if var_95_pct else None,
            "beta": round(beta, 2) if beta else None,
            "correlationSPY": round(corr_spy, 4) if corr_spy is not None else None,
            "portfolioCorrelation": round(portfolio_corr, 4) if portfolio_corr is not None else None,
            "daysUsed": len(port_returns),
        },
        "correlation": corr_matrix,
        "riskAttribution": risk_attribution,
    }

if __name__ == "__main__":
    holdings = json.loads(sys.argv[1])
    print(json.dumps(fetch_risk(holdings)))
