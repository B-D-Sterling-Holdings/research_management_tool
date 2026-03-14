"""Fetch current quotes for a list of tickers using yfinance."""
import json
import sys
import yfinance as yf

def fetch_quotes(tickers):
    result = {}
    for t in tickers:
        try:
            tk = yf.Ticker(t)
            info = tk.fast_info
            price = float(info.last_price) if hasattr(info, 'last_price') and info.last_price else None
            prev = float(info.previous_close) if hasattr(info, 'previous_close') and info.previous_close else None
            if price is None:
                # fallback to history
                hist = tk.history(period="2d")
                if not hist.empty:
                    price = float(hist['Close'].iloc[-1])
                    if len(hist) >= 2:
                        prev = float(hist['Close'].iloc[-2])
            day_change = (price - prev) if (price and prev) else 0
            day_change_pct = ((day_change / prev) * 100) if prev else 0
            result[t] = {
                "price": price,
                "previousClose": prev,
                "dayChange": round(day_change, 4),
                "dayChangePct": round(day_change_pct, 4),
            }
        except Exception as e:
            result[t] = {"price": None, "error": str(e)}
    return result

if __name__ == "__main__":
    tickers = sys.argv[1:]
    if not tickers:
        print(json.dumps({}))
    else:
        print(json.dumps(fetch_quotes(tickers)))
