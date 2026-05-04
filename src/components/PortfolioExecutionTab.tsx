import React, { useState, useMemo } from 'react';
import Plot from 'react-plotly.js';
import { calculatePortfolioEquityCurve, calculateRiskKPIs } from '../utils/quantMath';
import { formatCurrency, formatPercent } from '../utils/format';

import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface ExecutionProps {
  selectedTickers: string[];
  weights: Record<string, number | null>;
  datasetSeries: Record<string, any[]> | null;
  theme: 'light' | 'dark';
}

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '24px 24px 0 24px' }}>
      <h2 style={{
        fontSize: '13px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1.2px',
        opacity: 0.55,
        margin: 0,
      }}>
        {title}
      </h2>
      {badge && (
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '999px',
          background: 'var(--chipBg)',
          color: 'var(--chipText)',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>{badge}</span>
      )}
    </div>
  );
}

export default function PortfolioExecutionTab({
  selectedTickers, weights, datasetSeries, theme
}: ExecutionProps) {
  const textColor = theme === 'dark' ? '#cbd5e1' : '#334155';
  const gridColor = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  const paperBg = 'transparent';

  // OOS State
  const [oosMonths, setOosMonths] = useState<number>(24);

  // Alpaca State
  const [apiKey, setApiKey] = useLocalStorageState('alpaca-api-key', '');
  const [apiSecret, setApiSecret] = useLocalStorageState('alpaca-api-secret', '');
  const [isPaper, setIsPaper] = useLocalStorageState('alpaca-is-paper', true);
  const [investmentAmount, setInvestmentAmount] = useLocalStorageState<number>('alpaca-investment-amount', 10000);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success?: boolean; errors?: string[]; executed?: any[] } | null>(null);

  // --- OOS Logic ---
  const oosData = useMemo(() => {
    if (!datasetSeries || selectedTickers.length === 0) return null;
    
    // Find the latest date across all selected series
    let latestDateStr = '';
    for (const t of selectedTickers) {
      const series = datasetSeries[t] || [];
      if (series.length > 0) {
        const d = series[series.length - 1].date ?? series[series.length - 1].time;
        if (d && d > latestDateStr) {
          latestDateStr = d;
        }
      }
    }
    
    if (!latestDateStr) return null;
    
    const latestDate = new Date(latestDateStr);
    latestDate.setMonth(latestDate.getMonth() - oosMonths);
    const cutoffDateStr = latestDate.toISOString().substring(0, 10);

    const oosDataset: Record<string, any[]> = {};
    const isDataset: Record<string, any[]> = {};
    for (const t of selectedTickers) {
      const series = datasetSeries[t] || [];
      oosDataset[t] = [];
      isDataset[t] = [];
      for (const p of series) {
        const d = p.date ?? p.time;
        if (d >= cutoffDateStr) {
          oosDataset[t].push(p);
        } else {
          isDataset[t].push(p);
        }
      }
    }

    const isEquityCurve = calculatePortfolioEquityCurve(isDataset, selectedTickers, weights);
    const isKpis = calculateRiskKPIs(isEquityCurve);

    const oosEquityCurve = calculatePortfolioEquityCurve(oosDataset, selectedTickers, weights);
    const oosKpis = calculateRiskKPIs(oosEquityCurve);

    const forecastCurve: {date: string, value: number}[] = [];
    if (oosEquityCurve.length > 0) {
        // Calculate monthly expected return from IS data
        const annRetDecimal = (isKpis?.annReturn ?? 0) / 100;
        // avoid imaginary numbers if annReturn is extremely negative, floor at -99%
        const safeAnnRet = Math.max(annRetDecimal, -0.99);
        const monthlyRet = Math.pow(1 + safeAnnRet, 1/12) - 1;
        
        let expectedValue = 100; // All equity curves start at base 100
        for (let i = 0; i < oosEquityCurve.length; i++) {
            forecastCurve.push({ date: oosEquityCurve[i].date, value: expectedValue });
            expectedValue *= (1 + monthlyRet);
        }
    }

    return {
      isEquityCurve,
      isKpis,
      oosEquityCurve,
      oosKpis,
      forecastCurve
    };
  }, [datasetSeries, selectedTickers, weights, oosMonths]);

  // --- Execution Logic ---
  const normalizedWeights = useMemo(() => {
    const sumW = selectedTickers.reduce((acc, t) => acc + (weights[t] ?? 0), 0) || 1;
    return selectedTickers.map(t => ({
      ticker: t,
      targetWeightPercent: ((weights[t] ?? 0) / sumW) * 100
    }));
  }, [selectedTickers, weights]);

  const handleExecute = async () => {
    if (!apiKey || !apiSecret) {
      alert("Bitte API Key und Secret eingeben.");
      return;
    }
    if (investmentAmount <= 0) {
      alert("Investment-Betrag muss größer als 0 sein.");
      return;
    }

    setExecuting(true);
    setExecutionResult(null);

    try {
      const res = await fetch("/api/alpaca/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          api_secret: apiSecret,
          is_paper: isPaper,
          total_amount: investmentAmount,
          assets: normalizedWeights
        })
      });
      const data = await res.json();
      setExecutionResult(data);
    } catch (e: any) {
      setExecutionResult({ success: false, errors: [e.message] });
    } finally {
      setExecuting(false);
    }
  };

  if (selectedTickers.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', opacity: 0.5, fontSize: '15px' }}>
        🔍 Bitte wähle Aktien und Gewichte aus, um den Out-of-Sample Test & die Ausführung zu starten.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* --- OOS Test Section --- */}
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '24px' }}>
          <SectionHeader title="Out-of-Sample Test" badge="Stresstest auf jüngste Daten" />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '24px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>OOS Zeitraum:</label>
            <select 
              value={oosMonths} 
              onChange={e => setOosMonths(Number(e.target.value))}
              style={{
                background: 'var(--bg1)',
                color: 'var(--text1)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px'
              }}
            >
              <option value={6}>Letzte 6 Monate</option>
              <option value={12}>Letztes 1 Jahr</option>
              <option value={24}>Letzte 2 Jahre</option>
              <option value={60}>Letzte 5 Jahre</option>
            </select>
          </div>
        </div>

        {!oosData || oosData.oosEquityCurve.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>
            Nicht genügend Daten für diesen OOS-Zeitraum.
          </div>
        ) : (
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px', fontSize: '13px', opacity: 0.8 }}>
              Das Modell wurde auf Daten <b>vor</b> dem OOS-Zeitraum trainiert (In-Sample Rendite p.a.: <b>{formatPercent(oosData.isKpis?.annReturn ?? 0)}</b>). 
              Unten sehen Sie, wie die daraus resultierende Prognose im Vergleich zur echten Realität der letzten {oosMonths} Monate abschnitt.
            </div>

            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
               <div style={{ background: 'var(--bg1)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', flex: 1 }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.6, marginBottom: '4px' }}>Echte Rendite p.a. (OOS)</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: oosData.oosKpis && oosData.oosKpis.annReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {oosData.oosKpis ? formatPercent(oosData.oosKpis.annReturn) : '0%'}
                  </div>
               </div>
               <div style={{ background: 'var(--bg1)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', flex: 1 }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.6, marginBottom: '4px' }}>Echte Volatilität (OOS)</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {oosData.oosKpis ? formatPercent(oosData.oosKpis.annVol) : '0%'}
                  </div>
               </div>
               <div style={{ background: 'var(--bg1)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', flex: 1 }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.6, marginBottom: '4px' }}>Echte Sharpe Ratio (OOS)</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {oosData.oosKpis ? oosData.oosKpis.sharpe.toFixed(2) : '0.00'}
                  </div>
               </div>
            </div>

            <Plot
              data={[
                {
                  x: oosData.forecastCurve.map(d => d.date),
                  y: oosData.forecastCurve.map(d => d.value),
                  type: 'scatter',
                  mode: 'lines',
                  line: { color: theme === 'dark' ? '#818cf8' : '#6366f1', width: 2, dash: 'dot' },
                  name: 'Prognose (In-Sample Basis)',
                },
                {
                  x: oosData.oosEquityCurve.map(d => d.date),
                  y: oosData.oosEquityCurve.map(d => d.value),
                  type: 'scatter',
                  mode: 'lines',
                  line: { color: 'var(--primary)', width: 2.5 },
                  name: 'Echte Realität (OOS)',
                }
              ]}
              layout={{
                autosize: true,
                margin: { t: 10, l: 40, r: 20, b: 40 },
                paper_bgcolor: paperBg,
                plot_bgcolor: paperBg,
                font: { family: 'inherit', color: textColor, size: 11 },
                xaxis: { showgrid: true, gridcolor: gridColor },
                yaxis: { showgrid: true, gridcolor: gridColor },
                height: 300,
                legend: { orientation: 'h', y: -0.2 }
              } as any}
              style={{ width: '100%' }}
              config={{ displayModeBar: false, responsive: true }}
            />
          </div>
        )}
      </section>

      {/* --- Alpaca Execution Section --- */}
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <SectionHeader title="Live-Ausführung via Alpaca" badge="API Integration" />
        <div style={{ padding: '24px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Alpaca API Key</label>
                <input 
                  type="password" 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)} 
                  className="textInput"
                  placeholder="AKXXXXXX..."
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Alpaca API Secret</label>
                <input 
                  type="password" 
                  value={apiSecret} 
                  onChange={e => setApiSecret(e.target.value)} 
                  className="textInput"
                  placeholder="Secret Key..."
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="radio" checked={isPaper} onChange={() => setIsPaper(true)} />
                  Paper Trading
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="radio" checked={!isPaper} onChange={() => setIsPaper(false)} />
                  Live Trading
                </label>
              </div>
            </div>

            <div style={{ background: 'var(--bg1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
               <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Gesamt-Investment ($)</label>
               <input 
                  type="number" 
                  value={investmentAmount} 
                  onChange={e => setInvestmentAmount(Number(e.target.value))} 
                  className="textInput"
                  style={{ fontSize: '20px', fontWeight: 'bold' }}
                />

                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.6, marginBottom: '8px', fontWeight: 'bold' }}>Geplante Orders</div>
                  {normalizedWeights.map(w => {
                    const amount = investmentAmount * (w.targetWeightPercent / 100);
                    if (amount < 1) return null;
                    return (
                      <div key={w.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 600 }}>{w.ticker}</span>
                        <span>{formatPercent(w.targetWeightPercent)} &rarr; <b>{formatCurrency(amount, 0)}</b></span>
                      </div>
                    );
                  })}
                </div>
            </div>
          </div>

          {executionResult && (
            <div style={{ 
              padding: '16px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              background: executionResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${executionResult.success ? 'var(--success)' : 'var(--danger)'}`,
              color: executionResult.success ? 'var(--success)' : 'var(--danger)'
            }}>
              <h4 style={{ margin: '0 0 8px 0' }}>{executionResult.success ? 'Orders erfolgreich platziert!' : 'Fehler bei der Ausführung'}</h4>
              {executionResult.errors && executionResult.errors.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {executionResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
              {executionResult.executed && executionResult.executed.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {executionResult.executed.map((ex, i) => (
                    <li key={i}>{ex.ticker}: ${ex.notional.toFixed(2)} (ID: {ex.order_id})</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button 
            className="primaryButton" 
            style={{ width: '100%', fontSize: '16px', padding: '14px', fontWeight: 'bold' }}
            onClick={handleExecute}
            disabled={executing}
          >
            {executing ? 'Führe aus...' : '🚀 Portfolio Kaufen'}
          </button>
          
        </div>
      </section>

    </div>
  );
}
