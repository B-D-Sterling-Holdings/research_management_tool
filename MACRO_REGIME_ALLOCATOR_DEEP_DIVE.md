# Macro Regime Allocator Deep Dive

This document is an implementation-accurate audit of the macro regime allocator in this repository. It covers:

- The Python model and backtest in `macro_regime_allocator/`
- The Next.js and Supabase orchestration layer in `src/app/api/macro-regime/*` and `src/lib/macroRegimeSignal.js`
- The exact math, date alignment, artifacts, and known implementation quirks in the current codebase

It is intentionally written to match the code as it exists now, including non-obvious edge cases and mismatches between layers.

---

## 1. System Summary

The macro regime allocator is a two-asset tactical overlay:

- `equity`: SPY
- `tbills`: cash proxied by the Fed Funds rate

Its prediction target is binary:

- Class `0`: equity beats T-bills over the forward horizon
- Class `1`: T-bills match or beat equity over the forward horizon

The system has four distinct layers:

1. `data.py`
   Downloads market and macro data, resamples to month-end, engineers features, and constructs labels.
2. `model.py`
   Wraps `StandardScaler` plus `LogisticRegression`.
3. `backtest.py`, `results.py`, `validate.py`
   Run walk-forward training, map probabilities to portfolio weights, evaluate, and stress-test the strategy.
4. `src/app/api/macro-regime/*` plus `src/lib/macroRegimeSignal.js`
   Provide a web control plane that stores config in Supabase, launches Python runs, uploads outputs back to Supabase, and renders the latest signal in the app.

The main entrypoint is:

```bash
cd macro_regime_allocator
make run
```

The web UI calls the same Python package through `make` from `src/app/api/macro-regime/run/route.js`.

---

## 2. Configuration Model

### 2.1 Precedence

The runtime config is not sourced from one place. The effective precedence is:

1. Hardcoded dataclass defaults in `macro_regime_allocator/config.py`
2. Overrides from `macro_regime_allocator/config.yaml`
3. CLI overrides from `main.py`
   - `--window`
   - `--horizon`
4. If launched from the web app, Supabase config is written into `config.yaml` immediately before spawning Python

So the Python defaults are only fallback values. In normal web usage, the real runtime config is:

- Supabase `macro_regime_config.config`
- synced to `macro_regime_allocator/config.yaml`
- then loaded by `Config`

### 2.2 Current Checked-In Runtime Values

The checked-in `macro_regime_allocator/config.yaml` currently contains:

```yaml
start_date: "2000-01-01"
end_date: "2026-04-01"
equity_ticker: "SPY"
forecast_horizon_months: 1
macro_lag_months: 1
momentum_window: 3
volatility_window: 3
regularization_C: 0.5
class_weight: null
max_iter: 1000
recency_halflife_months: 12
window_type: "expanding"
rolling_window_months: 120
min_train_months: 48
holdout_start: "2020-01-01"
baseline_equity: 0.95
baseline_tbills: 0.05
min_weight: 0.01
max_weight: 0.97
allocation_steepness: 13
weight_smoothing_up: 0.98
weight_smoothing_down: 0.97
crash_overlay: true
vix_spike_threshold: 7
drawdown_defense_threshold: -10
credit_spike_threshold: 1.5
```

### 2.3 Important Fallback Differences

Several Python fallback defaults in `config.py` differ materially from the current synced YAML and the app defaults:

| Field | `config.py` fallback | App default / current synced YAML |
| --- | ---: | ---: |
| `baseline_equity` | 0.75 | 0.95 |
| `baseline_tbills` | 0.25 | 0.05 |
| `min_weight` | 0.05 | 0.10 in app default, `0.01` in checked-in YAML |
| `max_weight` | 0.95 | 0.97 |
| `allocation_steepness` | 10.0 | 13.0 |
| `weight_smoothing_up` | 0.70 | 0.98 |
| `weight_smoothing_down` | 1.00 | 0.97 |
| `recency_halflife_months` | 18 | 12 |
| `min_train_months` | 36 | 48 |
| `vix_spike_threshold` | 10.0 | 7.0 |
| `drawdown_defense_threshold` | -15.0 | -10.0 |

This matters because older comments in the Python code reflect the fallback behavior, while actual web-triggered runs use the synced values.

### 2.4 Computed Backdated Start Date

Downloads do not begin at `start_date`. The code backdates the start via:

```text
feature_warmup = 12 + 3 + 6
backdate = min_train_months
         + forecast_horizon_months
         + macro_lag_months
         + feature_warmup
data_start_date = start_date - backdate months
```

The hardcoded warmup components are:

- `12`: YoY inflation lookback
- `3`: credit spread 3-month change
- `6`: extra buffer for late-starting macro series

### 2.5 Defined But Currently Unused Config Fields

These fields exist in `Config` but are not used by the core implementation:

- `rebalance_frequency`
- `zscore_window`
- `confidence_blend`
- `credit_spike_threshold`

`credit_spike_threshold` is especially notable because the UI exposes it and `config.yaml` stores it, but the crash overlay never references it.

---

## 3. Data Pipeline

### 3.1 Source Data

### Yahoo Finance

From `data.py`:

- `SPY` via `cfg.equity_ticker`
- `^VIX`
- `^VIX3M`

Uses:

- SPY daily closes for monthly equity prices and intramonth drawdown
- VIX and VIX3M closes for volatility features and crash overlay inputs

### FRED / ALFRED

`Config.fred_series` defines:

| Internal name | FRED series |
| --- | --- |
| `cpi` | `CPIAUCSL` |
| `core_cpi` | `CPILFESL` |
| `unemployment` | `UNRATE` |
| `treasury_10y` | `DGS10` |
| `treasury_2y` | `DGS2` |
| `fed_funds` | `FEDFUNDS` |
| `credit_spread` | `BAMLH0A0HYM2` |
| `industrial_prod` | `INDPRO` |

For revisable series, the code uses ALFRED first-release values:

- `cpi`
- `core_cpi`
- `unemployment`
- `industrial_prod`

All other macro series are pulled from standard FRED observations.

Implementation note:

- `industrial_prod` is downloaded into the merged dataset but is not currently used in feature engineering, labels, or the crash overlay.
- `core_cpi` is only used as a fallback if `cpi` is unavailable; with the current configured FRED series, normal runs use `cpi`.

### 3.2 Download Behavior

`_download_asset_prices()`:

- downloads daily adjusted closes
- resamples to month-end with `.resample("ME").last()`
- computes intramonth max drawdown before resampling

For each month, intramonth drawdown is:

```math
\mathrm{intramonth\_dd}_m = \min_t \left(\frac{P_t}{\max_{s \le t} P_s} - 1\right) \times 100
```

within that calendar month.

`_download_vix_data()`:

- separately downloads `^VIX` and `^VIX3M`
- resamples both to month-end closes
- logs warnings instead of hard-failing if a download fails

`_download_fred_data()`:

- requires `FRED_API_KEY`
- hard-fails if no FRED series download succeeds
- resamples the assembled macro frame to month-end

### 3.3 Merge and Clean

`load_data()` does:

```python
merged = prices.join(vix, how="outer").join(macro, how="outer")
merged = merged.ffill().dropna(subset=["equity"], how="all")
```

So the monthly dataset is:

- outer-joined
- forward-filled
- then filtered only to rows where equity exists

It is written to:

```text
macro_regime_allocator/data/merged_monthly.csv
```

---

## 4. Feature Engineering

### 4.1 The Model Feature Set Is Usually 13, Not 12

The model has 12 core features plus an optional 13th:

1. `inflation_yoy`
2. `inflation_impulse`
3. `unemployment_rate`
4. `credit_spread_level`
5. `credit_spread_3m_change`
6. `real_fed_funds`
7. `yield_curve_slope`
8. `vix_1m_change`
9. `vix_term_structure`
10. `equity_momentum_3m`
11. `equity_vol_3m`
12. `equity_drawdown_from_high`
13. `equity_intramonth_dd` if the merged data contains `equity_intramonth_dd`

The current saved model artifact in `macro_regime_allocator/outputs/model.joblib` contains all 13 features, including `equity_intramonth_dd`.

### 4.2 Exact Feature Formulas

All features are engineered on the unlagged merged monthly frame first, then the entire feature matrix is shifted by `cfg.macro_lag_months`.

#### 1. `inflation_yoy`

Uses CPI if available, otherwise core CPI:

```math
\mathrm{inflation\_yoy}_t = \left(\frac{\mathrm{CPI}_t}{\mathrm{CPI}_{t-12}} - 1\right) \times 100
```

#### 2. `inflation_impulse`

```math
\mathrm{inflation\_impulse}_t
= \left[\left(\frac{\mathrm{CPI}_t}{\mathrm{CPI}_{t-3}}\right)^4 - 1\right] \times 100
- \mathrm{inflation\_yoy}_t
```

#### 3. `unemployment_rate`

```math
\mathrm{unemployment\_rate}_t = \mathrm{UNRATE}_t
```

#### 4. `credit_spread_level`

```math
\mathrm{credit\_spread\_level}_t = \mathrm{BAMLH0A0HYM2}_t
```

#### 5. `credit_spread_3m_change`

```math
\mathrm{credit\_spread\_3m\_change}_t
= \mathrm{credit\_spread}_t - \mathrm{credit\_spread}_{t-3}
```

#### 6. `real_fed_funds`

```math
\mathrm{real\_fed\_funds}_t
= \mathrm{FEDFUNDS}_t - \mathrm{inflation\_yoy}_t
```

#### 7. `yield_curve_slope`

```math
\mathrm{yield\_curve\_slope}_t
= \mathrm{DGS10}_t - \mathrm{DGS2}_t
```

#### 8. `vix_1m_change`

```math
\mathrm{vix\_1m\_change}_t = \mathrm{VIX}_t - \mathrm{VIX}_{t-1}
```

#### 9. `vix_term_structure`

```math
\mathrm{vix\_term\_structure}_t = \frac{\mathrm{VIX}_t}{\mathrm{VIX3M}_t}
```

If `vix3m` is unavailable, the code sets this feature to `1.0`.

#### 10. `equity_momentum_3m`

```math
\mathrm{equity\_momentum\_3m}_t
= \left(\frac{\mathrm{SPY}_t}{\mathrm{SPY}_{t-w_m}} - 1\right) \times 100
```

where `w_m = cfg.momentum_window`, currently `3`.

#### 11. `equity_vol_3m`

Let:

```math
r_t = \frac{\mathrm{SPY}_t}{\mathrm{SPY}_{t-1}} - 1
```

Then:

```math
\mathrm{equity\_vol\_3m}_t
= \mathrm{std}(r_{t-w_v+1}, \ldots, r_t) \times \sqrt{12} \times 100
```

where `w_v = cfg.volatility_window`, currently `3`.

#### 12. `equity_drawdown_from_high`

```math
\mathrm{equity\_drawdown\_from\_high}_t
= \left(\frac{\mathrm{SPY}_t}{\max(\mathrm{SPY}_{t-11}, \ldots, \mathrm{SPY}_t)} - 1\right) \times 100
```

#### 13. `equity_intramonth_dd`

If present, this is carried straight from the monthly dataset:

```math
\mathrm{equity\_intramonth\_dd}_t
= \min_{\tau \in t} \left(\frac{P_\tau}{\max_{s \le \tau} P_s} - 1\right) \times 100
```

within month `t`.

### 4.3 Lagging Convention

After all features are engineered:

```python
feats = feats.shift(cfg.macro_lag_months).dropna(how="all")
```

So with `macro_lag_months = 1`:

- the feature row dated `T` contains information computed from source data at `T - 1 month`
- the index is intentionally shifted forward to the month in which the prediction is made

This is the key date convention for the rest of the system.

### 4.4 Saved Feature Artifact

The feature matrix is written to:

```text
macro_regime_allocator/data/features.csv
```

---

## 5. Label Construction and Calendar Semantics

### 5.1 Forward Returns

`build_labels()` constructs two forward returns for each date `t`.

#### Equity

```math
r^{eq}_{t \to t+h}
= \left(\frac{\mathrm{SPY}_{t+h}}{\mathrm{SPY}_t} - 1\right) \times 100
```

#### T-bills

Let:

```math
m_j = \frac{\mathrm{FEDFUNDS}_{t+j}}{100 \times 12}
```

Then:

```math
r^{tb}_{t \to t+h}
= \left[\prod_{j=0}^{h-1} (1 + m_j) - 1\right] \times 100
```

The implementation compounds the monthlyized Fed Funds rate month by month.

### 5.2 Binary Label

The label is:

```math
\mathrm{label}_t =
\begin{cases}
0 & \text{if } r^{eq}_{t \to t+h} > r^{tb}_{t \to t+h} \\
1 & \text{if } r^{tb}_{t \to t+h} \ge r^{eq}_{t \to t+h}
\end{cases}
```

The code also stores:

- `fwd_ret_equity`
- `fwd_ret_tbills`
- `equity_excess_return = fwd_ret_equity - fwd_ret_tbills`

and writes the dataset to:

```text
macro_regime_allocator/data/labeled_dataset.csv
```

### 5.3 Exact Time Alignment Used by the Model

The most important alignment rule is:

- features at index `T` come from source data at `T - lag`
- labels at index `T` measure outcomes from `T` to `T + horizon`

So with the default `lag = 1`, `horizon = 1`, the model is effectively asked:

> Using information known from month `T-1`, who will win over month `T -> T+1`?

That is exactly how the code lines up `features` and `labels`.

---

## 6. Model

### 6.1 Estimator

`RegimeClassifier` wraps:

- `StandardScaler()`
- `LogisticRegression(...)`

with:

```python
LogisticRegression(
    C=cfg.regularization_C,
    class_weight=cfg.class_weight,
    max_iter=cfg.max_iter,
    solver="lbfgs",
    random_state=42,
)
```

There is no tree model, no ensemble, and no calibration layer.

### 6.2 Standardization

Before fitting:

```math
x_{ij}^{scaled} = \frac{x_{ij} - \mu_j}{\sigma_j}
```

where the scaler is fit only on the training slice for that refit.

### 6.3 Logistic Objective

For class `1 = tbills`, the model learns:

```math
P(y=1 \mid x) = \sigma(w^\top x + b)
```

with L2-regularized log loss. The backtest passes observation-level `sample_weight`, so the fitted objective is effectively:

```math
\mathcal{L}(w, b)
= -\sum_i s_i \left[y_i \log \hat{p}_i + (1-y_i)\log(1-\hat{p}_i)\right]
+ \lambda \lVert w \rVert_2^2
```

where the exact relationship between `C` and `\lambda` is handled internally by scikit-learn.

### 6.4 Sample Weights

The code multiplies two weighting schemes:

```math
s_i = w_i^{recency} \times w_i^{class}
```

#### Recency weighting

From `_recency_weights(n, halflife)`:

```math
w_i^{recency} = \exp\left(-\frac{\ln 2}{\mathrm{halflife}} \cdot a_i\right)
```

where `a_i` is the age in months counting backward from the newest point in the training set.

#### Class balancing

From `_class_balanced_weights(y)`:

```math
w_i^{class} = \frac{N}{N_c \cdot \mathrm{count}(y_i)}
```

where:

- `N` = number of training samples
- `N_c` = number of observed classes in that training slice

### 6.5 Coefficient Interpretation

For binary logistic regression in scikit-learn:

- `coef_[0]` corresponds to the positive class, here `tbills`
- positive coefficient means the feature pushes probability toward class `1`
- negative coefficient means the feature pushes probability toward class `0`

So in this repository the correct sign interpretation is:

- positive = favors T-bills
- negative = favors equity

That is how `results.py` interprets the coefficients.

### 6.6 Saved Model Artifact

`save_model()` stores:

- scaler
- classifier
- `feature_names`
- `is_fitted`

to:

```text
macro_regime_allocator/outputs/model.joblib
```

---

## 7. Probability-to-Weight Mapping

The portfolio allocation pipeline is:

1. logistic probability
2. biased sigmoid weight map
3. crash overlay
4. clipping to min/max weight
5. smoothing against prior equity weight

### 7.1 Sigmoid Weight Map

From `sigmoid_weight_map()`:

```math
\mathrm{bias} = \ln\left(\frac{w^{base}_{eq}}{w^{base}_{tb}}\right)
```

```math
x = (\hat{p}_{eq} - 0.5)\cdot S + \mathrm{bias}
```

```math
w_{eq}^{raw} = \frac{1}{1 + e^{-x}}
```

where:

- `\hat{p}_{eq} = probabilities[0]`
- `S = cfg.allocation_steepness`
- `w^{base}_{eq}, w^{base}_{tb}` come from `cfg.equal_weight`

With the current checked-in config:

- baseline = `95% / 5%`
- steepness = `13`

This means a 50/50 model probability maps near the baseline equity allocation, not near 50/50.

### 7.2 Crash Overlay

`crash_overlay()` uses current unlagged market data, not the lagged model features.

It returns:

```text
(adjusted_equity_weight, overlay_reason)
```

and can reduce equity weight by at most 50%.

#### Trigger 1: VIX spike

Condition:

```text
vix_1m_change > cfg.vix_spike_threshold
```

Penalty:

```math
\mathrm{severity}_1
= \min\left(\frac{\mathrm{vix\_1m\_change} - \mathrm{threshold}}{15}, 1\right)
```

```math
\mathrm{penalty}_1 = 0.50 \cdot \mathrm{severity}_1
```

#### Trigger 2: VIX panic

Condition:

```text
vix_term_structure > 1.08 and vix_1m_change > 3.0
```

Penalty:

```math
\mathrm{severity}_2
= \min((\mathrm{vix\_term\_structure} - 1.08)\cdot 5.0, 1)
```

```math
\mathrm{penalty}_2 = 0.35 \cdot \mathrm{severity}_2
```

#### Trigger 3: Drawdown crash

Condition:

```text
equity_drawdown_from_high < cfg.drawdown_defense_threshold
and drawdown_1m_change < -4.0
and vix_term_structure > 0.98
```

Penalty:

```math
\mathrm{severity}_3 = \min\left(\frac{-\mathrm{drawdown\_1m\_change}}{10}, 1\right)
```

```math
\mathrm{penalty}_3 = 0.30 \cdot \mathrm{severity}_3
```

#### Combined overlay

```math
\mathrm{total\_penalty} = \min(\mathrm{penalty}_1 + \mathrm{penalty}_2 + \mathrm{penalty}_3, 0.50)
```

```math
w_{eq}^{overlay} = w_{eq}^{raw}\cdot(1-\mathrm{total\_penalty})
```

If no trigger fires, the reason string is `"none"`.

### 7.3 Current Market Data Used by the Overlay

`_gather_market_data()` reconstructs:

- the 12 core feature-style signals
- `drawdown_1m_change` for the overlay

Important detail:

- it does **not** reconstruct `equity_intramonth_dd`
- so the optional 13th model feature is not part of the `market_signals` payload saved in live prediction output

### 7.4 Clipping

After overlay:

```math
w_{eq}^{clip} = \mathrm{clip}(w_{eq}^{overlay}, \mathrm{min\_weight}, \mathrm{max\_weight})
```

Then:

```math
w_{tb} = 1 - w_{eq}
```

### 7.5 Smoothing

Smoothing is applied outside `probabilities_to_weights()`, both in backtests and live prediction.

The implementation is:

```math
w_{eq}^{smooth} = \alpha \cdot w_{eq}^{target} + (1-\alpha)\cdot w_{eq}^{prev}
```

with:

```math
\alpha =
\begin{cases}
\alpha_{up} & \text{if } w_{eq}^{target} \ge w_{eq}^{prev} \\
\alpha_{down} & \text{otherwise}
\end{cases}
```

Under the current checked-in config:

- `weight_smoothing_up = 0.98`
- `weight_smoothing_down = 0.97`

So in practice:

- increases in equity are slightly faster
- decreases in equity are slightly slower

This differs from the older fallback defaults in `config.py`, which were `0.70` up and `1.00` down.

---

## 8. Walk-Forward Backtest

### 8.1 Universe Construction

`run_backtest()` first drops any feature row with any missing feature:

```python
valid_mask = features.notna().all(axis=1)
features = features.loc[valid_mask].copy()
```

Labels are not required for every feature row, only for training rows.

### 8.2 Monthly Realized Return Series

The backtest loads `merged_monthly.csv` and constructs:

```python
monthly_returns["equity"] = merged["equity"].pct_change()
monthly_returns["tbills"] = merged[rate_col].shift(1) / 100 / 12
```

So the realized T-bills leg in the backtest is a one-month shifted monthlyized Fed Funds rate.

### 8.3 Refit Cadence

The loop is:

```python
for i in range(cfg.min_train_months, len(all_dates), horizon):
```

So:

- refits happen every `forecast_horizon_months`
- with the default horizon of 1, this is monthly
- with horizon > 1, the code skips ahead by that horizon to avoid overlapping holding periods

### 8.4 Training Slice

For each rebalance index `i`:

```python
train_end = i - horizon + 1
train_start = 0 if expanding else max(0, train_end - rolling_window_months)
train_idx = all_dates[train_start:train_end]
train_idx_with_labels = [d for d in train_idx if d in y_all.index]
```

Because Python slices exclude the endpoint, `train_idx` includes data through index `i - horizon`.

That is the exact implementation.

The run is skipped if:

- `len(y_train) < min_train_months`
- or only one class is present

### 8.5 Per-Step Flow

For each rebalance date `T`:

1. Fit a fresh `RegimeClassifier`
2. Predict `proba = model.predict_proba(X.loc[[T]])[0]`
3. Build current unlagged `market_data`
4. Convert probabilities to weights
5. Smooth against the previous equity weight
6. Compute realized equity and T-bills returns over the next `horizon` months

For `horizon = 1`, the realized return row at date `T+1` corresponds to the signal made from the feature row at `T`.

### 8.6 Stored Backtest Row

Each stored row includes:

- `rebalance_date`
- `return_date`
- `pred_class`
- `actual_label`
- `prob_equity`
- `prob_tbills`
- `weight_equity`
- `weight_tbills`
- `overlay`
- `ret_equity`
- `ret_tbills`
- `port_return`
- `ew_return`
- `ret_6040`
- `train_size`
- all market-data fields prefixed as `md_*`

### 8.7 Benchmarks

The backtest compares the model portfolio with:

- static baseline from `cfg.equal_weight`
- static `60/40`
- pure equity
- pure T-bills

### 8.8 Cumulative Series and Synthetic Start Row

After the backtest rows are assembled, the code creates cumulative series:

```python
bt[col] = 100 * (1 + bt[src].fillna(0)).cumprod()
```

for:

- `cum_port`
- `cum_ew`
- `cum_equity`
- `cum_tbills`
- `cum_6040`

Then it prepends a synthetic row one month earlier with all cumulative values set to `100.0`.

This row is useful for charts, but it has knock-on effects in some summary metrics because not every helper excludes it explicitly.

### 8.9 Turnover

Turnover is:

```math
\mathrm{turnover}_t
= |w_{eq,t} - w_{eq,t-1}| + |w_{tb,t} - w_{tb,t-1}|
```

implemented by differencing both weights and summing absolute changes.

### 8.10 Final Model Fit

After the walk-forward backtest, a separate final model is fit on all available feature rows that still have realized labels through:

```python
final_idx = all_dates[:len(all_dates) - horizon]
```

This model is saved to `outputs/model.joblib`.

The backtest returns:

- `backtest`
- `final_model`
- `prev_equity_weight`

---

## 9. Evaluation Layer

### 9.1 Classification Metrics

`results.evaluate()` computes:

- accuracy
- balanced accuracy
- confusion matrix
- `classification_report()`

from:

- `actual_label`
- `pred_class`

### 9.2 Direction / Capture Metrics

It also computes:

- direction accuracy:

```math
\frac{1}{N}\sum \mathbf{1}\{(\mathrm{ret\_equity} > \mathrm{ret\_tbills}) = (w_{eq} > 0.5)\}
```

- magnitude-weighted accuracy using `|ret_equity - ret_tbills|`
- upside capture
- downside capture

### 9.3 Defensive Metrics

The defensive metrics are defined against the baseline equity weight `cfg.equal_weight[0]`.

#### Crisis hit rate

Worst 10% equity months:

```python
n_crisis = max(1, int(len(equity_rets) * 0.10))
```

Then measure how often:

```text
weight_equity < baseline_equity
```

#### Calm ride rate

Among months where equity beats T-bills, measure how often:

```text
weight_equity >= baseline_equity - 0.01
```

#### Cost of false defense

For months where the strategy was defensive but equity won, compare actual portfolio return with the baseline-weight portfolio return and sum the shortfall.

#### Defense payoff

For months where the strategy was defensive and T-bills won, compare actual portfolio return with the baseline-weight portfolio return and sum the gain.

### 9.4 Investment Metrics

`_investment_metrics()` computes:

- CAGR
- volatility
- Sharpe
- Sortino
- Calmar
- max drawdown
- max drawdown duration
- VaR 95
- CVaR 95
- hit rate
- total return
- best and worst month
- average up and down month
- up/down ratio
- win and lose streak

### 9.5 Generated Reports and Plots

`results.py` writes:

- `outputs/investment_metrics.csv`
- `outputs/report.md`

and plots:

- `cumulative_returns.png`
- `drawdowns.png`
- `equity_weight_over_time.png`
- `probabilities_over_time.png`
- `rolling_sharpe.png`
- `confusion_matrix.png`
- `coefficients.png`

### 9.6 Important Implementation Nuance

`_investment_metrics()` uses `len(returns)` directly for `n_months`, but many return calculations skip the synthetic start-row `NaN` automatically because pandas reductions default to `skipna=True`.

So:

- return-based metrics mostly ignore the prepended row
- `n_months` and the derived `n_years` still count it

That is how the current implementation behaves.

---

## 10. Validation Suite

`validate.py` runs six analyses.

### 10.1 Parameter Sensitivity

Multiplicative sweeps are applied to:

- `regularization_C`
- `allocation_steepness`
- `recency_halflife_months`
- `min_train_months`

with factors:

```text
0.5, 0.75, 0.9, 1.1, 1.25, 1.5
```

Smoothing uses additive perturbations instead of multiplicative ones:

- `weight_smoothing_down`: `[-0.15, -0.08, -0.03, 0.03, 0.02, 0.01]`
- `weight_smoothing_up`: `[-0.15, -0.08, -0.03, 0.01, 0.01, 0.01]`

Values are clipped into `[0.01, 1.0]` and duplicates are removed.

If `holdout_start` exists, metrics are scored only on dates before that holdout boundary.

### 10.2 Ablation Studies

Variants:

- `full_system`
- `no_crash_overlay`
- `no_smoothing`
- `no_recency_weighting`
- `model_only`
- `baseline_50_50`
- `baseline_60_40`
- `baseline_75_25`
- `baseline_95_5`

### 10.3 Subperiod Analysis

Computes metrics for:

- full period
- each decade bucket
- excluding `2008-2009`
- excluding `2020 H1`
- excluding both crisis windows
- in-sample and holdout if `holdout_start` is configured

### 10.4 Bootstrap Confidence

Uses circular block bootstrap with:

- `n_bootstrap = 1000`
- `block_size = 12`

It bootstraps:

- model Sharpe
- excess Sharpe vs baseline
- excess CAGR vs baseline

### 10.5 Coefficient Stability

Tracks rolling coefficient paths and scores each feature by:

```math
\mathrm{instability}
= 0.5 \cdot \mathrm{rank}(\mathrm{change\_std})
+ 0.3 \cdot \mathrm{rank}(\mathrm{max\_abs\_jump})
+ 0.2 \cdot \mathrm{rank}(\mathrm{spike\_freq})
```

where:

- `change_std` = standard deviation of first differences
- `max_abs_jump` = largest absolute first difference
- `spike_freq` = share of first differences bigger than `2 * median(abs(diff))`

### 10.6 Defensive Accuracy

Runs the same crisis-hit, calm-ride, false-defense-cost, and defense-payoff calculations as the main evaluation layer.

### 10.7 Robustness Verdict

`_print_summary()` assigns:

- `ROBUST` if warnings <= 1
- `PARTIALLY ROBUST` if warnings == 2
- `FRAGILE` otherwise

Validation outputs are saved into:

```text
macro_regime_allocator/outputs/validation/
```

---

## 11. Web and Supabase Integration

This is the part the original writeup mostly omitted. It matters because the repo contains both a Python research engine and a production-style app wrapper around it.

### 11.1 API Surface

#### `GET /api/macro-regime/config`

- reads Supabase table `macro_regime_config`
- returns saved config if present
- otherwise returns the app-side `DEFAULT_CONFIG`

#### `PUT /api/macro-regime/config`

- upserts `{ id: 1, config, updated_at }` into `macro_regime_config`

#### `GET /api/macro-regime/results`

- reads the latest `macro_regime_results` row
- returns:
  - `backtest`
  - `metrics`
  - `report`
  - `plots`
  - `validationReport`
  - `validationData`
  - `currentSignal`

`currentSignal` here is derived from the latest backtest row, not from `live_prediction`.

#### `GET /api/macro-regime/predict`

- does **not** run Python inference
- loads the latest `macro_regime_results` row from Supabase
- prefers its `live_prediction`
- falls back to deriving a signal from the saved backtest

`POST /api/macro-regime/predict` does the same thing.

#### `GET /api/macro-regime/run`

- returns current run status from `/tmp/macro-regime-run-status.json`
- returns accumulated run log from `/tmp/macro-regime-run-output.log`
- returns last five run-history rows from `macro_regime_runs`

#### `POST /api/macro-regime/run`

Accepts:

- `run`
- `predict`
- `fast`
- `validate`
- `clean`

Behavior by command:

- `run` -> spawns `make run`
- `fast` -> spawns `make fast`
- `validate` -> spawns `make validate`
- `clean` -> spawns `make clean`
- `predict` -> does not spawn Python; it loads the latest saved signal from Supabase, writes that into the temporary log/status files, and marks the request complete

#### `GET /api/macro-regime/plots`

- loads base64 plots from the latest `macro_regime_results` row
- either lists plot names or streams a single PNG

#### `GET/PUT /api/macro-regime/weights`

- persists user-selected portfolio weights in `macro_regime_weights`
- this is separate from the model output itself

### 11.2 Run Orchestration

Before `run`, `fast`, or `validate`, the app does:

1. read Supabase config
2. manually rewrite `macro_regime_allocator/config.yaml`
3. spawn `make <command>` inside `macro_regime_allocator/`

The YAML writer intentionally skips:

- `deriskOverlay`

because that is a frontend-only field.

### 11.3 Supabase Result Payload

After a successful `run`, `fast`, or `validate`, `syncToSupabase()` uploads:

- `backtest`
- `live_prediction`
- `metrics`
- `report`
- `plots`
- `validation_report`
- `validation_data`

into `macro_regime_results`.

Plots are stored as base64 blobs keyed by filename.

### 11.4 Run History and Pruning

The app keeps only:

- the latest 5 `macro_regime_runs`
- the latest 3 `macro_regime_results`

by deleting older rows after each completed run.

### 11.5 Local Cleanup After Sync

After syncing results to Supabase, the app best-effort deletes:

- all files under `outputs/plots/`
- `outputs/backtest_results.csv`
- `outputs/investment_metrics.csv`
- `outputs/report.md`
- `outputs/live_prediction.json`
- everything under `outputs/validation/`
- every file under `data/`

It does **not** delete `outputs/model.joblib`.

This has real consequences:

- `make fast` may fail later because `data/merged_monthly.csv` was deleted
- `make predict` may fail later for the same reason, even if the model file still exists
- the web `predict` endpoint still works because it reads Supabase, not local cached files

### 11.6 Signal Formatting in the App

`src/lib/macroRegimeSignal.js` converts weights into regime labels:

- `RISK ON` if `equityWeight >= 0.85`
- `CAUTIOUS` if `equityWeight >= 0.60`
- `RISK OFF` otherwise

It also creates the raw text block shown in the UI.

### 11.7 Date Handling Mismatch Between Stored Live Prediction and Backtest Fallback

There are two signal-building conventions in the web layer:

#### Live prediction JSON

Built by Python in `main.py`:

- `rebalance_date = latest_date - macro_lag_months`
- `allocation_month = latest_date`

#### Backtest fallback signal

Built in `buildSignalFromBacktest()`:

- `dataAsOf = rebalance_date`
- `allocationFor = rebalance_date + 1 month`

These are not the same convention.

In other words:

- the saved live prediction treats the feature-row date as the allocation month
- the backtest-derived fallback treats the backtest `rebalance_date` as the "data as of" month and then adds one month for display

That one-month naming mismatch is currently part of the implementation.

---

## 12. CLI and Makefile Behavior

The `Makefile` exposes:

```make
run:
	source ../.env.local && export FRED_API_KEY && uv run python main.py

predict:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --predict

fast:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --skip-download

validate:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --validate

validate-fast:
	source ../.env.local && export FRED_API_KEY && uv run python main.py --skip-download --validate

clean:
	rm -rf outputs/*.csv outputs/*.md outputs/*.joblib outputs/plots/*.png outputs/validation/
```

Important notes:

- the web API exposes `run`, `predict`, `fast`, `validate`, `clean`
- it does **not** expose `validate-fast`
- web `predict` is not the same as CLI `make predict`
  - CLI `make predict` runs Python and requires local cached data plus `model.joblib`
  - web `predict` only reads the latest signal from Supabase

---

## 13. Artifact Map

### 13.1 Core Python Files

| File | Role |
| --- | --- |
| `config.py` | Dataclass config, YAML loader, computed `data_start_date` |
| `config.yaml` | Runtime overrides, typically synced from Supabase |
| `data.py` | Downloads, merge, feature engineering, label construction |
| `model.py` | Scaler plus logistic regression wrapper |
| `backtest.py` | Weight mapping, crash overlay, walk-forward engine |
| `results.py` | Reports, metrics, plots |
| `validate.py` | Robustness suite |
| `main.py` | CLI entrypoint |
| `Makefile` | Operational commands |

### 13.2 Typical Intermediate Files

Generated locally before the app may upload and delete them:

- `data/merged_monthly.csv`
- `data/features.csv`
- `data/labeled_dataset.csv`
- `outputs/backtest_results.csv`
- `outputs/investment_metrics.csv`
- `outputs/report.md`
- `outputs/live_prediction.json`
- `outputs/model.joblib`
- `outputs/plots/*.png`
- `outputs/validation/*.csv`
- `outputs/validation/validation_report.md`

### 13.3 Web-Layer Files

| File | Role |
| --- | --- |
| `src/lib/macroRegimeSignal.js` | Signal normalization, regime labels, Supabase read helper |
| `src/app/api/macro-regime/config/route.js` | Config read/write |
| `src/app/api/macro-regime/results/route.js` | Latest backtest/result payload |
| `src/app/api/macro-regime/predict/route.js` | Latest saved signal |
| `src/app/api/macro-regime/run/route.js` | Run orchestration, sync, pruning |
| `src/app/api/macro-regime/plots/route.js` | Plot fetch/stream |
| `src/app/api/macro-regime/weights/route.js` | Saved portfolio weights |
| `src/app/(dashboard)/macro-regime/page.jsx` | Main UI |

---

## 14. Implementation Notes and Caveats

These are the most important repo-accurate caveats uncovered in this audit.

### 14.1 The model feature count is not always 12

The code can train on `equity_intramonth_dd` as a 13th feature, and the current saved model does.

### 14.2 `_gather_market_data()` does not mirror all trained features

It reconstructs the 12 core signals plus `drawdown_1m_change`, but not `equity_intramonth_dd`.

So:

- trained model features and exposed live `market_signals` are not guaranteed to match exactly

### 14.3 `credit_spike_threshold` is dormant

It is defined in:

- `config.py`
- `config.yaml`
- app config defaults
- the dashboard UI

but the crash overlay does not use it.

### 14.4 The app's `predict` endpoint is a read endpoint, not an inference endpoint

It serves the latest saved signal from Supabase. It does not run `main.py --predict`.

### 14.5 App cleanup removes the local cache that `fast` and CLI `predict` need

After successful web-triggered runs, the app deletes `data/*.csv`. That makes cached-data commands brittle unless a new local full run recreates them.

### 14.6 `get_coefficients()` labels the single binary row misleadingly

`RegimeClassifier.get_coefficients()` names rows using:

```python
[self.cfg.class_labels[i] for i in range(coefs.shape[0])]
```

For binary logistic regression `coef_.shape[0] == 1`, so the row is labeled as class `0` (`equity`), even though scikit-learn's single binary coefficient vector corresponds to class `1` (`tbills`).

`results.py` still interprets the sign correctly, but the row label itself is misleading.

### 14.7 `coefficient_stability()` does not use the exact same training slice as `run_backtest()`

Backtest training uses:

```python
train_end = i - horizon + 1
```

Coefficient stability uses:

```python
train_end = i - horizon
```

Both match the same refit cadence, but the validation helper trails the backtest's slice by one endpoint position.

### 14.8 `train_size` in backtest rows is not the final labeled training count

The stored field is:

```python
"train_size": train_end
```

not `len(train_idx_with_labels)`.

So it is closer to a slice endpoint counter than the exact number of observations actually fit after label filtering.

### 14.9 Some summary durations count the synthetic start row

Because `n_months = len(returns)` in `_investment_metrics()`, the prepended chart-start row is included in time-length calculations even though its returns are `NaN`.

---

## 15. End-to-End Flow

```text
1. Config resolved
   config.py fallback
   -> config.yaml overrides
   -> CLI overrides
   -> or web layer rewrites config.yaml from Supabase before launch

2. Data download
   SPY daily prices
   VIX / VIX3M
   FRED / ALFRED macro data

3. Monthly merge
   month-end resample
   forward-fill
   save merged_monthly.csv

4. Feature engineering
   12 core features
   + optional equity_intramonth_dd
   shift forward by macro_lag_months
   save features.csv

5. Label construction
   forward equity return
   forward compounded T-bills return
   binary label
   save labeled_dataset.csv

6. Walk-forward backtest
   refit scaler + logistic regression each step
   sample weights = recency * class balance
   map probabilities to weights
   crash overlay
   smoothing
   realized returns and benchmarks
   save backtest_results.csv

7. Final model
   fit on all available labeled rows
   save model.joblib

8. Evaluation and validation
   metrics CSV
   markdown report
   plots
   optional validation suite

9. Live prediction
   final model predicts latest feature row
   save live_prediction.json

10. Web layer
   upload artifacts to Supabase
   serve current signal and plots from Supabase
   prune old runs/results
   clean local intermediate files
```

---

## 16. Bottom Line

The codebase implements a monthly, walk-forward, logistic-regression allocator that predicts whether SPY will beat cash over the next horizon and then transforms that probability into a constrained, smoothed equity/T-bills allocation. The core model is simple and interpretable. The operational layer around it is not trivial: config syncing, Supabase result storage, cached-file cleanup, and two different "predict" semantics all materially affect how the system behaves in practice.

The two biggest documentation corrections versus the old writeup are:

- the implementation can and currently does use a 13th model feature, `equity_intramonth_dd`
- the app layer is part of the real system, and it introduces important runtime behavior and naming mismatches that need to be understood alongside the math
