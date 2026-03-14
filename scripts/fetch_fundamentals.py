"""Fetch fundamental data for portfolio tickers using yfinance."""
import json
import sys
import yfinance as yf

def fetch_fundamentals(tickers):
    result = {}
    for t in tickers:
        try:
            tk = yf.Ticker(t)
            info = tk.info or {}
            result[t] = {
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "marketCap": info.get("marketCap"),
                "pe": info.get("trailingPE"),
                "forwardPe": info.get("forwardPE"),
                "peg": info.get("pegRatio"),
                "pb": info.get("priceToBook"),
                "ps": info.get("priceToSalesTrailing12Months"),
                "evEbitda": info.get("enterpriseToEbitda"),
                "evRevenue": info.get("enterpriseToRevenue"),
                "beta": info.get("beta"),
            }
        except Exception as e:
            result[t] = {"error": str(e)}
    return result

if __name__ == "__main__":
    tickers = sys.argv[1:]
    if not tickers:
        print(json.dumps({}))
    else:
        print(json.dumps(fetch_fundamentals(tickers)))
