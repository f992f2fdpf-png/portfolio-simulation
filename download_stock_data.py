import pathlib

import yfinance as yf


def download_stock_data(symbol: str, start: str, end: str, output_path: pathlib.Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    data = yf.download(symbol, start=start, end=end, progress=False)
    data.to_csv(output_path, index=True)
    print(f"Saved {len(data)} rows for {symbol} to {output_path}")


if __name__ == "__main__":
    symbol = "AAPL"
    start_date = "2005-01-01"
    end_date = "2026-01-01"
    output_file = pathlib.Path("public/data/apple.csv")

    download_stock_data(symbol, start_date, end_date, output_file)
