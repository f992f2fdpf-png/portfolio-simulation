import json
import os
from datetime import datetime
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import yfinance as yf
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)  # Allow CORS for local dev

@app.route("/api/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])

    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}"
    headers = {"User-Agent": "Mozilla/5.0"}
    
    try:
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        quotes = data.get("quotes", [])
        
        # Filter mostly equities and ETFs and map results
        results = []
        for q in quotes:
            # quoteType like EQUITY, ETF, MUTUALFUND, CURRENCY, CRYPTOCURRENCY
            if q.get("quoteType") in ("EQUITY", "ETF", "MUTUALFUND", "CRYPTOCURRENCY", "INDEX", "CURRENCY"):
                results.append({
                    "ticker": q.get("symbol"),
                    "name": q.get("longname") or q.get("shortname") or q.get("symbol"),
                    "type": q.get("quoteType"),
                    "exchange": q.get("exchDisp")
                })
        
        return jsonify(results)
    except Exception as e:
        print(f"Search API error: {e}")
        return jsonify({"error": "Failed to fetch search results from Yahoo"}), 500


@app.route("/api/historical", methods=["GET"])
def get_historical_data():
    symbol = request.args.get("symbol")
    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400

    # Default to 10 years of monthly data like the app usually expects
    # We grab 10y and monthly interval. Sometimes latest date is needed too.
    try:
        print(f"Fetching data for {symbol}...")
        ticker = yf.Ticker(symbol)
        
        # We need historical prices to compute returns (Adj Close)
        hist = ticker.history(period="max", interval="1mo")
        
        if hist.empty:
            return jsonify({"error": f"No data found for {symbol}"}), 404
            
        hist = hist.dropna(subset=["Close"])
        
        # Format the data for the frontend
        # The frontend expects a series array of `{ year: number, value: number, formattedTime?: string }`
        # wait, the local `datasetSeries` is an object with { time: string, [ticker]: number }
        # Let's inspect the expected format.
        
        # Instead of returning a full unified dataset structure, we will return the time series for this exact ticker
        # e.g., [{"time": "2020-01", "value": 150.2}, ...]
        series = []
        for date, row in hist.iterrows():
            series.append({
                "time": date.strftime("%Y-%m-%d"),
                "value": row["Close"]  # Using close or adj close
            })

        # yfinance `.info` might be slow or fail, we'll try to get longName
        info = {}
        try:
            # We don't fetch .info fully if it's too slow. `fast_info` works in newer yfinance.
            # But let's safely ignore it if it fails.
            pass
        except:
            pass

        return jsonify({
            "ticker": symbol,
            "series": series
        })

    except Exception as e:
        print(f"yfinance failed for {symbol}, trying direct CSV download fallback...")
        try:
            # Fallback: Try direct download link (often works when JSON API is blocked)
            # 10 years back
            end_ts = int(datetime.now().timestamp())
            start_ts = end_ts - (10 * 365 * 24 * 60 * 60)
            
            csv_url = f"https://query1.finance.yahoo.com/v7/finance/download/{symbol}?period1={start_ts}&period2={end_ts}&interval=1mo&events=history&includeAdjustedClose=true"
            res = session.get(csv_url, timeout=10)
            res.raise_for_status()
            
            from io import StringIO
            df = pd.read_csv(StringIO(res.text))
            if df.empty:
                raise ValueError("CSV data is empty")
            
            # Use 'Adj Close' if available, otherwise 'Close'
            price_col = 'Adj Close' if 'Adj Close' in df.columns else 'Close'
            series = []
            for _, row in df.iterrows():
                if pd.notna(row[price_col]):
                    series.append({
                        "time": str(row["Date"]),
                        "value": float(row[price_col])
                    })
            
            return jsonify({
                "ticker": symbol,
                "series": series,
                "source": "csv_fallback"
            })
        except Exception as fallback_e:
            print(f"Fallback also failed for {symbol}: {fallback_e}")
            return jsonify({"error": f"Yahoo Finance blockiert den Zugriff. Bitte gib die Rendite manuell in den Einstellungen ein. (Details: {str(e)})"}), 500


@app.route("/api/options", methods=["GET"])
def get_options_data():
    symbol = request.args.get("symbol")
    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400
        
    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options
        if not expirations:
            return jsonify({"error": "No options available for this ticker"}), 404
            
        dates_to_fetch = expirations[:6] # Next 6 expirations
        surface_data = [] 
        
        for date in dates_to_fetch:
            chain = ticker.option_chain(date)
            calls = chain.calls
            
            for _, row in calls.iterrows():
                if pd.notna(row.get('impliedVolatility')) and row['impliedVolatility'] > 0:
                    surface_data.append({
                        "expiration": date,
                        "strike": float(row['strike']),
                        "iv": float(row['impliedVolatility'])
                    })
        
        return jsonify({
            "ticker": symbol,
            "surface": surface_data
        })
    except Exception as e:
        print(f"Options API error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/alpaca/execute", methods=["POST"])
def execute_alpaca():
    data = request.json
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400

    api_key = data.get("api_key") or os.environ.get("ALPACA_API_KEY")
    api_secret = data.get("api_secret") or os.environ.get("ALPACA_API_SECRET")
    is_paper = data.get("is_paper", True)
    total_amount = data.get("total_amount", 0)
    assets = data.get("assets", [])

    if not api_key or not api_secret:
        return jsonify({"error": "Missing API keys. Please provide them in the UI or set ALPACA_API_KEY and ALPACA_API_SECRET in the .env file."}), 400

    if not assets:
        return jsonify({"error": "No assets provided"}), 400

    if total_amount <= 0:
        return jsonify({"error": "Total amount must be greater than 0"}), 400

    base_url = "https://paper-api.alpaca.markets" if is_paper else "https://api.alpaca.markets"
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Content-Type": "application/json"
    }

    results = []
    errors = []

    for asset in assets:
        original_ticker = asset.get("ticker")
        weight_percent = asset.get("targetWeightPercent", 0)

        if not original_ticker or weight_percent <= 0:
            continue

        # Map Yahoo Finance crypto tickers to Alpaca format (e.g. BTC-USD -> BTC/USD)
        alpaca_ticker = original_ticker
        if alpaca_ticker.endswith("-USD"):
            alpaca_ticker = alpaca_ticker.replace("-USD", "/USD")

        # Calculate exact dollar amount to buy
        notional_amount = total_amount * (weight_percent / 100.0)
        
        # Alpaca requires notional amounts to be at least $1 typically, 
        # let's round to 2 decimal places for safety.
        notional_amount = round(notional_amount, 2)
        
        if notional_amount < 1.0:
            errors.append(f"Amount for {original_ticker} (${notional_amount}) is too small, skipped.")
            continue

        # Crypto markets are 24/7, so 'day' is invalid. They require 'gtc' or 'ioc'.
        tif = "gtc" if "/USD" in alpaca_ticker else "day"

        order_data = {
            "symbol": alpaca_ticker,
            "notional": notional_amount,
            "side": "buy",
            "type": "market",
            "time_in_force": tif
        }

        try:
            resp = requests.post(f"{base_url}/v2/orders", headers=headers, json=order_data)
            resp_data = resp.json()

            if resp.status_code in (200, 201):
                results.append({
                    "ticker": original_ticker,
                    "notional": notional_amount,
                    "status": "success",
                    "order_id": resp_data.get("id")
                })
            else:
                err_msg = resp_data.get("message", "Unknown error")
                errors.append(f"Failed to buy {original_ticker}: {err_msg}")
        except Exception as e:
            errors.append(f"Exception buying {original_ticker}: {str(e)}")

    return jsonify({
        "success": len(results) > 0,
        "executed": results,
        "errors": errors
    })


@app.route("/api/historical-daily", methods=["GET"])
def get_historical_daily():
    symbol = request.args.get("symbol")
    start  = request.args.get("start")   # YYYY-MM-DD
    end    = request.args.get("end")     # YYYY-MM-DD
    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400
    try:
        print(f"Fetching daily data for {symbol} {start} - {end}...")
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=start, end=end, interval="1d")
        if hist.empty:
            return jsonify({"error": f"No data for {symbol}"}), 404
        hist = hist.dropna(subset=["Close"])
        series = [{"time": date.strftime("%Y-%m-%d"), "value": float(row["Close"])}
                  for date, row in hist.iterrows()]
        return jsonify({"ticker": symbol, "series": series})
    except Exception as e:
        print(f"Daily history error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Use PORT from environment (for Render/hosting) or default to 5000
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
