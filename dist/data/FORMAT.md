# Offline-Datensätze (historische Preise)

Die Anwendung lädt historische Preisdaten **ausschließlich lokal** aus `public/data/…`.

## 1) Dataset-Manifest

`public/data/datasets.json`

```json
{
  "datasets": [
    { "id": "sample-monthly", "name": "Sample", "frequency": "monthly", "file": "/data/prices.json" }
  ]
}
```

## 2) Preise-Datei (JSON)

Beispiel: `public/data/prices.json`

```json
{
  "meta": {
    "frequency": "monthly",
    "currency": "USD",
    "assets": ["AAPL", "MSFT"]
  },
  "prices": {
    "AAPL": [["2020-01-31", 77.38], ["2020-02-28", 68.34]],
    "MSFT": [["2020-01-31", 170.23], ["2020-02-28", 162.01]]
  }
}
```

### Regeln
- Datum: ISO-Format `YYYY-MM-DD`
- Reihenfolge: beliebig (wird intern sortiert), aber **sollte** aufsteigend sein
- Preise: `number`
- Assets: müssen zu den Tickern in der App passen (z.B. `AAPL`, `SPY`, `GLD`)

## 3) Update ohne Codeänderung
- Datei in `public/data/…` austauschen
- ggf. `datasets.json` anpassen
- App neu laden

