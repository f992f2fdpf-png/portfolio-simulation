import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { calculateCorrelationMatrix, calculateBeta, calculateLogReturns, calculateAlignedBeta, calculatePortfolioEquityCurve } from '../utils/quantMath';

interface AnalyticsProps {
  selectedTickers: string[];
  weights: Record<string, number | null>;
  datasetSeries: Record<string, { time: string, value: number }[]> | null;
  theme: 'light' | 'dark';
}

export default function PortfolioAnalyticsTab({ selectedTickers, weights, datasetSeries, theme }: AnalyticsProps) {
  // Option Surface State
  const [surfaceData, setSurfaceData] = useState<any[]>([]);
  const [surfaceLoading, setSurfaceLoading] = useState(false);
  const [surfaceError, setSurfaceError] = useState('');
  const [selectedSurfaceTicker, setSelectedSurfaceTicker] = useState<string>('');

  // Market Baseline State (for Beta)
  const [marketRawSeries, setMarketRawSeries] = useState<{ date: string, value: number }[]>([]);

  // Fetch Options Surface
  useEffect(() => {
    if (!selectedSurfaceTicker) {
      setSurfaceData([]);
      return;
    }
    let active = true;
    setSurfaceLoading(true);
    setSurfaceError('');
    fetch(`/api/options?symbol=${selectedSurfaceTicker}`)
      .then(res => res.json())
      .then(data => {
        if (active) {
          if (data.error) throw new Error(data.error);
          setSurfaceData(data.surface || []);
          setSurfaceLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setSurfaceError(err.message);
          setSurfaceLoading(false);
        }
      });
    return () => { active = false; };
  }, [selectedSurfaceTicker]);

  // Fetch SPY baseline if we have selected tickers
  useEffect(() => {
    if (selectedTickers.length === 0) return;
    fetch(`/api/historical?symbol=SPY`)
      .then(res => res.json())
      .then(data => {
        const spySeries = data.series || [];
        setMarketRawSeries(spySeries.map((s: any) => ({ date: s.time, value: s.value })));
      })
      .catch(err => console.error("Could not fetch SPY:", err));
  }, [selectedTickers]);


  // Correlation Matrix
  const correlationData = useMemo(() => {
    if (selectedTickers.length === 0 || !datasetSeries) return null;
    
    // Filter datasetSeries to only include selected tickers
    const filteredSeries: Record<string, any[]> = {};
    for (const t of selectedTickers) {
      if (datasetSeries[t]) filteredSeries[t] = datasetSeries[t];
    }

    const matrix = calculateCorrelationMatrix(filteredSeries);
    
    // Convert to Plotly heatmap format (Z matrix)
    const z: number[][] = [];
    const text: string[][] = [];
    const labels = selectedTickers;
    
    for (const y of labels) {
      const row: number[] = [];
      const textRow: string[] = [];
      for (const x of labels) {
        const entry = matrix.find(m => m.x === x && m.y === y);
        const val = entry ? entry.value : 0;
        row.push(val);
        // Only show text if there's enough space (e.g., <= 10 tickers)
        textRow.push(labels.length <= 10 ? val.toFixed(2) : '');
      }
      z.push(row);
      text.push(textRow);
    }
    return { z, x: labels, y: labels, text };
  }, [datasetSeries, selectedTickers]);

  // Portfolio Beta computation
  const portfolioBeta = useMemo(() => {
    if (selectedTickers.length === 0 || marketRawSeries.length === 0) return 0;

    // Normalize weights
    const sumW = Object.values(weights).reduce((acc: number, weight) => acc + (weight || 0), 0) || 1;

    let wBetaSum = 0;
    for (const ticker of selectedTickers) {
      if (datasetSeries && datasetSeries[ticker]) {
        const assetData = (datasetSeries[ticker] as any).map((s: any) => ({
          date: s.date ?? s.time,
          value: s.price ?? s.value
        }));
        let b = 1.0;
        if (ticker === 'SPY' || ticker === '^GSPC') {
          b = 1.0;
        } else {
          b = calculateAlignedBeta(assetData, marketRawSeries);
        }

        const weight = ((weights[ticker] ?? 0) / sumW);
        wBetaSum += (b * weight);
      }
    }
    return wBetaSum;
  }, [selectedTickers, weights, datasetSeries, marketRawSeries]);

  // Performance Comparison (Portfolio vs Market)
  const performanceComparisonData = useMemo(() => {
    if (selectedTickers.length === 0 || marketRawSeries.length === 0 || !datasetSeries) return null;

    const portCurve = calculatePortfolioEquityCurve(datasetSeries as any, selectedTickers, weights);
    if (portCurve.length === 0) return null;

    // Create a normalized market curve starting at the same time
    const marketMap = new Map<string, number>();
    for (const s of marketRawSeries) {
      marketMap.set(s.date.substring(0, 7) + "-01", s.value);
    }

    const startDate = portCurve[0].date;
    const startMarketVal = marketMap.get(startDate) || 0;

    if (startMarketVal <= 0) return { portCurve, marketCurve: [] };

    const marketCurve = portCurve.map(p => {
      const mVal = marketMap.get(p.date) || 0;
      return {
        date: p.date,
        value: mVal > 0 ? (mVal / startMarketVal) * 100 : 0
      };
    }).filter(p => p.value > 0);

    return { portCurve, marketCurve };
  }, [datasetSeries, selectedTickers, weights, marketRawSeries]);

  // Volatility Surface 3D Traces
  const surfacePlotData = useMemo(() => {
    if (surfaceData.length === 0) return null;

    // Group by expiration and mapping strikes to IV
    const dates = Array.from(new Set(surfaceData.map(d => d.expiration))).sort() as string[];
    const strikes = Array.from(new Set(surfaceData.map(d => d.strike))).sort((a: any, b: any) => a - b) as number[];

    // Z matrix: [date_index][strike_index]
    const z: (number | null)[][] = dates.map(() => strikes.map(() => null));

    surfaceData.forEach(d => {
      const dIdx = dates.indexOf(d.expiration);
      const sIdx = strikes.indexOf(d.strike);
      if (dIdx !== -1 && sIdx !== -1) {
        z[dIdx][sIdx] = d.iv * 100; // Format as percentage
      }
    });

    return [{
      type: 'surface',
      x: strikes,
      y: dates,
      z: z,
      colorscale: 'Viridis',
      colorbar: { title: 'Implied Vol (%)' }
    }];
  }, [surfaceData]);

  if (selectedTickers.length === 0 && !selectedSurfaceTicker) {
    return <div className="emptyState">Bitte wähle Aktien und Gewichte aus, um die Analysen zu starten.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.2fr) minmax(400px, 2fr)', gap: '24px' }}>

        {/* Professional Beta Card */}
        <section className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.5, marginBottom: '24px', margin: 0 }}>
            Portfolio Beta
          </h2>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '72px', fontWeight: '300', letterSpacing: '-2px', color: portfolioBeta > 1.2 ? 'var(--danger, #ef4444)' : portfolioBeta < 0.8 && portfolioBeta > 0 ? 'var(--success, #10b981)' : (theme === 'dark' ? '#f1f5f9' : '#1e293b'), marginBottom: '32px' }}>
              {marketRawSeries.length > 0 ? portfolioBeta.toFixed(2) : "--"}
            </div>

            {marketRawSeries.length > 0 && (
              <div style={{ width: '100%', maxWidth: '320px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: theme === 'dark' ? '#cbd5e1' : '#64748b' }}>
                  <span>Defensiv (0.0)</span>
                  <span>Markt (1.0)</span>
                  <span>Aggressiv (2.0)</span>
                </div>
                <div style={{ position: 'relative', width: '100%', height: '4px', background: '#e5e7eb', borderRadius: '2px' }}>
                  {/* Beta Indicator Line */}
                  <div style={{
                    position: 'absolute',
                    left: `${Math.max(0, Math.min(100, (portfolioBeta / 2) * 100))}%`,
                    top: '-6px',
                    width: '4px',
                    height: '16px',
                    backgroundColor: theme === 'dark' ? '#f8fafc' : '#111',
                    borderRadius: '2px',
                    transform: 'translateX(-50%)',
                    transition: 'left 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
                  }} />

                  {/* Market Center Marker (1.0) */}
                  <div style={{ position: 'absolute', left: '50%', top: '-2px', bottom: '-2px', width: '2px', backgroundColor: '#a1a1aa', transform: 'translateX(-50%)' }} />
                </div>
              </div>
            )}

            <p style={{ opacity: theme === 'dark' ? 0.85 : 0.6, textAlign: 'center', marginTop: '36px', fontSize: '13px', lineHeight: '1.6', maxWidth: '300px' }}>
              Quantifiziert die Volatilität deines Portfolios relativ zum Finanzmarkt. Der Referenzindex (S&P 500) hat strukturell ein Beta von exakt 1.0.
            </p>

            {performanceComparisonData && performanceComparisonData.marketCurve.length > 0 && (
              <div style={{ width: '100%', height: '160px', marginTop: '32px' }}>
                {/* @ts-ignore */}
                <Plot
                  data={[
                    {
                      x: performanceComparisonData.portCurve.map(s => s.date),
                      y: performanceComparisonData.portCurve.map(s => s.value),
                      type: 'scatter',
                      mode: 'lines',
                      name: 'Portfolio',
                      line: { color: (theme === 'dark' ? '#4ade80' : '#16a34a'), width: 2.5 },
                      hovertemplate: '<b>Portfolio: %{y:.1f}%</b><br>%{x}<extra></extra>'
                    },
                    {
                      x: performanceComparisonData.marketCurve.map(s => s.date),
                      y: performanceComparisonData.marketCurve.map(s => s.value),
                      type: 'scatter',
                      mode: 'lines',
                      name: 'S&P 500',
                      line: { color: (theme === 'dark' ? '#64748b' : '#94a3b8'), width: 1.5, dash: 'dot' },
                      hovertemplate: '<b>Markt: %{y:.1f}%</b><br>%{x}<extra></extra>'
                    }
                  ]}
                  layout={{
                    autosize: true,
                    margin: { t: 5, l: 30, r: 5, b: 30 },
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                    font: { color: theme === 'dark' ? '#94a3b8' : '#64748b', size: 9 },
                    showlegend: true,
                    legend: {
                      orientation: 'h',
                      y: -0.3,
                      x: 0.5,
                      xanchor: 'center',
                      bgcolor: 'transparent',
                      font: { size: 10 }
                    },
                    xaxis: {
                      showgrid: false,
                      showline: false,
                      zeroline: false,
                      tickfont: { size: 8, opacity: 0.6 }
                    },
                    yaxis: {
                      showgrid: true,
                      gridcolor: theme === 'dark' ? '#334155' : '#f1f5f9',
                      zeroline: false,
                      tickfont: { size: 8, opacity: 0.6 },
                      ticksuffix: '%'
                    }
                  }}
                  style={{ width: '100%', height: '100%' }}
                  config={{ displayModeBar: false, responsive: true }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Professional Correlation Card */}
        <section className="card" style={{ overflow: 'hidden', padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.5, margin: 0 }}>
              Korrelationsmatrix
            </h2>
            <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Pearson</span>
          </div>

          {correlationData ? (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              {/* @ts-ignore */}
              <Plot
                data={[{
                  z: correlationData.z,
                  x: correlationData.x,
                  y: correlationData.y,
                  type: 'heatmap',
                  text: correlationData.text,
                  texttemplate: "%{text}",
                  hoverinfo: 'x+y+z',
                  colorscale: [
                    [0, '#ef4444'],   // Red for negative correlation
                    [0.5, theme === 'dark' ? '#1f2937' : '#f8fafc'], // Neutral background for 0
                    [1, '#10b981']    // Green for strong positive
                  ],
                  zmin: -1,
                  zmax: 1,
                  showscale: true,
                  colorbar: {
                    thickness: 15,
                    len: 0.8,
                    tickfont: { size: 10, color: theme === 'dark' ? '#94a3b8' : '#64748b' }
                  }
                } as any]}
                layout={{
                  autosize: true,
                  margin: { t: 0, l: 60, r: 0, b: 60 },
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { family: 'inherit', color: theme === 'dark' ? '#cbd5e1' : '#334155', size: 11 },
                  xaxis: { tickangle: -45, showgrid: false, zeroline: false },
                  yaxis: { showgrid: false, zeroline: false }
                }}
                style={{ width: '100%', minHeight: '340px' }}
                config={{ displayModeBar: false, responsive: true }}
              />
            </div>
          ) : (
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, fontSize: '14px' }}>
              Nicht genügend Daten für eine Matrix. Bitte mindestens eine Aktie auswählen.
            </div>
          )}
        </section>
      </div>

      {/* Surface Plot Row */}
      <section className="card">
        <h2 className="cardTitle">3D Implizite Volatilität Surface</h2>
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <label className="label">Aktie auswählen:</label>
          <select
            className="textInput"
            value={selectedSurfaceTicker}
            onChange={e => setSelectedSurfaceTicker(e.target.value)}
            style={{ width: '200px' }}
          >
            <option value="">-- Wähle eine Aktie --</option>
            {selectedTickers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {surfaceLoading && <span>Lade live Options-Chain von der echten Börse... Dies kann einen Moment dauern!</span>}
          {surfaceError && <span style={{ color: 'var(--danger, #ef4444)' }}>Fehler: {surfaceError}</span>}
        </div>

        {surfacePlotData ? (
          <div style={{ width: '100%', height: '600px', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
            {/* @ts-ignore */}
            <Plot
              data={surfacePlotData as any}
              layout={{
                width: 900,
                height: 600,
                title: `Implied Volatility Surface - ${selectedSurfaceTicker}`,
                margin: { t: 40, l: 0, r: 0, b: 0 },
                paper_bgcolor: 'transparent',
                font: { color: theme === 'dark' ? '#cbd5e1' : '#334155' },
                scene: {
                  xaxis: { title: 'Strike Price ($)', gridcolor: theme === 'dark' ? '#334155' : '#e2e8f0', zerolinecolor: theme === 'dark' ? '#475569' : '#cbd5e1' },
                  yaxis: { title: 'Expiration', gridcolor: theme === 'dark' ? '#334155' : '#e2e8f0', zerolinecolor: theme === 'dark' ? '#475569' : '#cbd5e1' },
                  zaxis: { title: 'Implied Vol (%)', gridcolor: theme === 'dark' ? '#334155' : '#e2e8f0', zerolinecolor: theme === 'dark' ? '#475569' : '#cbd5e1' },
                  camera: { eye: { x: 1.5, y: -1.5, z: 1.2 } }
                }
              }}
            />
          </div>
        ) : (
          <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            {selectedSurfaceTicker ? (surfaceLoading ? "Lade 3D Surface..." : "Keine Optionen gefunden.") : "Bitte oben eine Aktie zur Berechnung der Surface selektieren."}
          </div>
        )}
      </section>

    </div>
  );
}
