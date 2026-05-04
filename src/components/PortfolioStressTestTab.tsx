import React, { useMemo, useRef, useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  calculatePortfolioEquityCurve,
  calculateDrawdowns,
  calculateRiskKPIs,
  calculateAlignedBeta,
} from '../utils/quantMath';

interface StressTestProps {
  selectedTickers: string[];
  weights: Record<string, number | null>;
  datasetSeries: Record<string, any[]> | null;
  theme: 'light' | 'dark';
}

// ─── Animated KPI number ───────────────────────────────────────────────────────
function AnimatedNumber({ value, suffix = '', decimals = 2, color }: {
  value: number;
  suffix?: string;
  decimals?: number;
  color?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const end = value;
    const duration = 700;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = start + (end - start) * eased;
      if (ref.current) {
        ref.current.textContent = current.toFixed(decimals) + suffix;
      }
      if (t < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    prev.current = end;
  }, [value, decimals, suffix]);

  return <span ref={ref} style={{ color }}>{value.toFixed(decimals)}{suffix}</span>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, suffix = '', decimals = 2, color, subLabel, icon }: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  color?: string;
  subLabel?: string;
  icon?: string;
}) {
  return (
    <div
      style={{
        padding: '24px 20px',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: 'var(--bg1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: 'var(--shadowSm)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadowSm)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Subtle color accent bar at top */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '3px',
        background: color ?? 'var(--primary)',
        borderRadius: '16px 16px 0 0',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.55, fontWeight: 700 }}>
          {label}
        </div>
        {icon && <span style={{ fontSize: '18px', opacity: 0.45 }}>{icon}</span>}
      </div>

      <div style={{ fontSize: '38px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: '4px' }}>
        <AnimatedNumber value={value} suffix={suffix} decimals={decimals} color={color} />
      </div>

      {subLabel && (
        <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>{subLabel}</div>
      )}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
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

// ─── Crisis definitions ───────────────────────────────────────────────────────
// fetchStart/fetchEnd: range to download daily data
// crisisStart/crisisEnd: range to search for the peak and subsequent trough
const CRISES = [
  { name: 'Finanzkrise 2008',    fetchStart: '2008-01-01', fetchEnd: '2010-01-01', crisisStart: '2008-05-01', crisisEnd: '2009-06-01', emoji: '💥' },
  { name: 'Corona-Crash 2020',   fetchStart: '2020-01-01', fetchEnd: '2020-06-01', crisisStart: '2020-02-01', crisisEnd: '2020-05-01', emoji: '🦠' },
  { name: 'Bärenmarkt 2022',     fetchStart: '2021-06-01', fetchEnd: '2023-06-01', crisisStart: '2021-11-01', crisisEnd: '2023-01-01', emoji: '🐻' },
  { name: 'Q4 2018 Zins-Schock', fetchStart: '2018-06-01', fetchEnd: '2019-06-01', crisisStart: '2018-08-01', crisisEnd: '2019-01-01', emoji: '📉' },
];

// ─── Daily peak-to-trough helper ──────────────────────────────────────────────────
function computeDailyPeakToTrough(
  seriesMap: Record<string, { time: string; value: number }[]>,
  tickers: string[],
  weights: Record<string, number | null>,
  crisisStart: string,
  crisisEnd: string,
): number | null {
  const sumW = Object.values(weights).reduce((a: number, w) => a + (w || 0), 0) || 1;

  // Build date → ticker → price map
  const byDate: Record<string, Record<string, number>> = {};
  for (const t of tickers) {
    for (const pt of (seriesMap[t] || [])) {
      if (!byDate[pt.time]) byDate[pt.time] = {};
      byDate[pt.time][t] = pt.value;
    }
  }

  // Common dates where all tickers have data, within crisis window
  const dates = Object.keys(byDate)
    .filter(d => d >= crisisStart && d <= crisisEnd && tickers.every(t => (byDate[d][t] ?? 0) > 0))
    .sort();

  if (dates.length < 2) return null;

  // Baseline = first date in window
  const baseline: Record<string, number> = {};
  for (const t of tickers) baseline[t] = byDate[dates[0]][t];

  // Build portfolio equity curve starting from baseline
  const curve = dates.map(d => {
    let val = 0;
    for (const t of tickers) {
      const pBaseline = baseline[t];
      const pCurrent = byDate[d][t];
      val += ((weights[t] ?? 0) / sumW) * 100 * (pCurrent / pBaseline);
    }
    return val;
  });

  // Find max drawdown: start with first price, track peak, find lowest drop from that peak
  let currentPeak = curve[0];
  let maxDrawdown = 0; // as a ratio, e.g. -0.34
  for (const val of curve) {
    if (val > currentPeak) {
      currentPeak = val;
    }
    const currentDD = (val - currentPeak) / currentPeak;
    if (currentDD < maxDrawdown) {
      maxDrawdown = currentDD;
    }
  }
  return maxDrawdown * 100; // e.g. -34.0
}

// Golden color palette for donut
const DONUT_COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#10b981',
  '#f43f5e', '#a855f7', '#3b82f6', '#84cc16',
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PortfolioStressTestTab({
  selectedTickers, weights, datasetSeries, theme,
}: StressTestProps) {
  const textColor  = theme === 'dark' ? '#cbd5e1' : '#334155';
  const gridColor  = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  const paperBg   = 'transparent';

  // ── Core computations ──────────────────────────────────────────────────────
  const { equityCurve, drawdowns, maxDrawdown, kpis, riskContributions } = useMemo(() => {
    if (!datasetSeries || selectedTickers.length === 0) {
      return { equityCurve: [], drawdowns: [], maxDrawdown: 0, kpis: null, riskContributions: [] };
    }

    const eqCurve = calculatePortfolioEquityCurve(datasetSeries, selectedTickers, weights);
    if (eqCurve.length === 0) {
      return { equityCurve: [], drawdowns: [], maxDrawdown: 0, kpis: null, riskContributions: [] };
    }

    const { drawdowns: ddSeries, maxDrawdown } = calculateDrawdowns(eqCurve);
    const kpis = calculateRiskKPIs(eqCurve);

    // Risk contributions: weight × beta relative to portfolio
    const sumW = Object.values(weights).reduce((acc: number, w) => acc + (w || 0), 0) || 1;
    const rc: { ticker: string; riskContrib: number }[] = [];

    for (const t of selectedTickers) {
      const series = datasetSeries[t] || [];
      const assetData = series.map((s: any) => ({
        date: (s.date ?? s.time).substring(0, 7) + '-01',
        value: s.price ?? s.value,
      }));
      const beta = calculateAlignedBeta(assetData, eqCurve);
      const w = (weights[t] ?? 0) / sumW;
      rc.push({ ticker: t, riskContrib: Math.max(0, w * beta) });
    }

    const sumRc = rc.reduce((a, b) => a + b.riskContrib, 0) || 1;
    rc.forEach(r => (r.riskContrib = (r.riskContrib / sumRc) * 100));

    return { equityCurve: eqCurve, drawdowns: ddSeries, maxDrawdown, kpis, riskContributions: rc };
  }, [datasetSeries, selectedTickers, weights]);

  // ── Daily crisis data (fetched from backend) ───────────────────────────────────
  const [dailyCrisisReturns, setDailyCrisisReturns] = useState<(number | null)[]>([]);
  const [dailyCrisisLoading, setDailyCrisisLoading] = useState(false);

  useEffect(() => {
    if (selectedTickers.length === 0) return;
    let cancelled = false;
    setDailyCrisisLoading(true);

    (async () => {
      const results: (number | null)[] = [];
      for (const c of CRISES) {
        const seriesMap: Record<string, { time: string; value: number }[]> = {};
        for (const t of selectedTickers) {
          try {
            const res = await fetch(`/api/historical-daily?symbol=${t}&start=${c.fetchStart}&end=${c.fetchEnd}`);
            const data = await res.json();
            if (data.series) seriesMap[t] = data.series;
          } catch { /* ignore per-ticker errors */ }
        }
        if (cancelled) return;
        const allTickersFetched = selectedTickers.every(t => (seriesMap[t]?.length ?? 0) > 0);
        results.push(allTickersFetched
          ? computeDailyPeakToTrough(seriesMap, selectedTickers, weights, c.crisisStart, c.crisisEnd)
          : null
        );
      }
      if (!cancelled) {
        setDailyCrisisReturns(results);
        setDailyCrisisLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedTickers.join(','), JSON.stringify(weights)]);

  // ── Crisis performance (daily data preferred, monthly peak-to-trough fallback) ──
  const crisesPerformance = useMemo(() => {
    return CRISES.map((c, ci) => {
      // 1. Daily data (most accurate)
      if (!dailyCrisisLoading && dailyCrisisReturns.length > ci) {
        const dailyDD = dailyCrisisReturns[ci];
        if (typeof dailyDD === 'number' && dailyDD < 0) {
          return { ...c, return: dailyDD, valid: true };
        }
      }

      // 2. Fallback: monthly equity curve (if daily not yet loaded or failed)
      if (equityCurve.length > 0) {
        const windowPts = equityCurve.filter(
          e => e.date >= c.crisisStart.substring(0, 7) + '-01' &&
               e.date <= c.crisisEnd
        );
        if (windowPts.length >= 2) {
          let peak = windowPts[0].value;
          let mDD = 0;
          for (const pt of windowPts) {
            if (pt.value > peak) peak = pt.value;
            const dd = (pt.value - peak) / peak;
            if (dd < mDD) mDD = dd;
          }
          if (mDD < 0) return { ...c, return: mDD * 100, valid: true };
        }
      }

      return { ...c, return: 0, valid: false };
    });
  }, [equityCurve, dailyCrisisReturns, dailyCrisisLoading]);


  // ── Rolling 12-month volatility for Underwater chart overlay ──────────────
  const rollingVol = useMemo(() => {
    if (equityCurve.length < 13) return [];
    const result: { date: string; vol: number }[] = [];
    for (let i = 12; i < equityCurve.length; i++) {
      const slice = equityCurve.slice(i - 12, i + 1);
      const logRets: number[] = [];
      for (let j = 1; j < slice.length; j++) {
        if (slice[j - 1].value > 0) logRets.push(Math.log(slice[j].value / slice[j - 1].value));
      }
      const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
      const variance = logRets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (logRets.length - 1);
      result.push({ date: slice[slice.length - 1].date, vol: Math.sqrt(variance * 12) * 100 });
    }
    return result;
  }, [equityCurve]);

  // ── Sharpe color ───────────────────────────────────────────────────────────
  const sharpeColor = (kpis?.sharpe ?? 0) >= 1
    ? (theme === 'dark' ? '#4ade80' : '#16a34a')
    : (kpis?.sharpe ?? 0) >= 0
    ? textColor
    : (theme === 'dark' ? '#f87171' : '#dc2626');

  const sortinoColor = (kpis?.sortino ?? 0) >= 1.5
    ? (theme === 'dark' ? '#4ade80' : '#16a34a')
    : textColor;

  const dangerColor = theme === 'dark' ? '#f87171' : '#dc2626';

  // ── Empty states ──────────────────────────────────────────────────────────
  if (selectedTickers.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', opacity: 0.5, fontSize: '15px' }}>
        🔍 Bitte wähle Aktien und Gewichte aus, um den Stresstest zu starten.
      </div>
    );
  }

  if (equityCurve.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', opacity: 0.5, fontSize: '15px' }}>
        ⏳ Lade historische Daten oder nicht genügend Schnittmengen vorhanden...
      </div>
    );
  }

  // ── Crisis bar chart data ──────────────────────────────────────────────────
  const validCrises = crisesPerformance.filter(c => c.valid);
  const crisisColors = validCrises.map(c =>
    c.return >= 0
      ? (theme === 'dark' ? 'rgba(74,222,128,0.85)' : 'rgba(22,163,74,0.85)')
      : (theme === 'dark' ? 'rgba(248,113,113,0.85)' : 'rgba(220,38,38,0.85)')
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* ── KPI Dashboard ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))', gap: '16px' }}>
        <KpiCard
          label="Sharpe Ratio"
          value={kpis?.sharpe ?? 0}
          color={sharpeColor}
          subLabel="Rendite / Volatilität"
          icon="⚡"
        />
        <KpiCard
          label="Sortino Ratio"
          value={kpis?.sortino ?? 0}
          color={sortinoColor}
          subLabel="Rendite / Abwärtsrisiko"
          icon="🎯"
        />
        <KpiCard
          label="Max Drawdown"
          value={maxDrawdown}
          suffix="%"
          color={dangerColor}
          subLabel="Größter Peak-to-Trough"
          icon="🌊"
        />
        <KpiCard
          label="Volatilität p.a."
          value={kpis?.annVol ?? 0}
          suffix="%"
          color="var(--primary)"
          subLabel="Annualisierte Schwankung"
          icon="📊"
        />
        <KpiCard
          label="Rendite p.a."
          value={kpis?.annReturn ?? 0}
          suffix="%"
          decimals={2}
          color={(kpis?.annReturn ?? 0) >= 0 ? (theme === 'dark' ? '#4ade80' : '#16a34a') : dangerColor}
          subLabel="Annualisierte Gesamtrendite"
          icon="📈"
        />
      </div>

      {/* ── Row 2: Underwater Chart + Donut ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,3.5fr) minmax(280px,2fr)', gap: '20px' }}>

        {/* Drawdown / Underwater Chart */}
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <SectionHeader title="Underwater Chart (Drawdowns)" badge="Verlust vom Allzeithoch" />
          {/* @ts-ignore */}
          <Plot
            data={[
              {
                x: drawdowns.map(d => d.date),
                y: drawdowns.map(d => d.value),
                type: 'scatter',
                mode: 'lines',
                fill: 'tozeroy',
                fillcolor: theme === 'dark' ? 'rgba(248,113,113,0.18)' : 'rgba(239,68,68,0.15)',
                line: { color: theme === 'dark' ? '#f87171' : '#ef4444', width: 2 },
                name: 'Drawdown',
                hovertemplate: '<b>%{x}</b><br>Drawdown: %{y:.2f}%<extra></extra>',
              },
              // Rolling Vol as secondary line (right axis)
              ...(rollingVol.length > 0 ? [{
                x: rollingVol.map(r => r.date),
                y: rollingVol.map(r => r.vol),
                type: 'scatter',
                mode: 'lines',
                yaxis: 'y2',
                line: { color: theme === 'dark' ? '#818cf8' : '#6366f1', width: 1.5, dash: 'dot' },
                name: 'Roll. Vol. 12M (%)',
                opacity: 0.85,
                hovertemplate: '<b>%{x}</b><br>12M-Volatilität: %{y:.1f}%<extra></extra>',
              } as any] : []),
            ]}
            layout={{
              autosize: true,
              margin: { t: 30, l: 58, r: 60, b: 50 },
              paper_bgcolor: paperBg,
              plot_bgcolor: paperBg,
              font: { family: 'inherit', color: textColor, size: 11 },
              xaxis: { showgrid: true, gridcolor: gridColor, zeroline: false },
              yaxis: {
                title: 'Drawdown (%)',
                showgrid: true,
                gridcolor: gridColor,
                ticksuffix: '%',
                zeroline: true,
                zerolinecolor: gridColor,
              },
              yaxis2: {
                title: 'Volatilität (%)',
                overlaying: 'y',
                side: 'right',
                showgrid: false,
                ticksuffix: '%',
              },
              hovermode: 'x unified',
              legend: {
                orientation: 'h',
                y: -0.18,
                x: 0.5,
                xanchor: 'center',
                bgcolor: 'transparent',
              },
            } as any}
            style={{ width: '100%', height: '360px' }}
            config={{ displayModeBar: false, responsive: true }}
          />
        </section>

        {/* Risk Contribution Donut */}
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <SectionHeader title="Risikobeiträge" badge="Beta × Gewicht" />
          {/* @ts-ignore */}
          <Plot
            data={[{
              values: riskContributions.map(rc => rc.riskContrib),
              labels: riskContributions.map(rc => rc.ticker),
              type: 'pie',
              hole: 0.62,
              textinfo: 'label+percent',
              textposition: 'outside',
              pull: riskContributions.map(() => 0.02),
              marker: {
                colors: riskContributions.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]),
                line: { color: theme === 'dark' ? '#0b1220' : '#ffffff', width: 2 },
              },
              hovertemplate: '<b>%{label}</b><br>Risikobeitrag: %{value:.1f}%<extra></extra>',
            }]}
            layout={{
              autosize: true,
              margin: { t: 20, l: 20, r: 20, b: 20 },
              paper_bgcolor: paperBg,
              plot_bgcolor: paperBg,
              font: { family: 'inherit', color: textColor, size: 11 },
              showlegend: true,
              legend: {
                orientation: 'v',
                x: 1.05,
                y: 0.5,
                xanchor: 'left',
                bgcolor: 'transparent',
              },
              annotations: [{
                text: '⚠️<br><b style="font-size:11px">Risiko</b>',
                x: 0.5, y: 0.5,
                font: { size: 14, color: textColor },
                showarrow: false,
              }],
            } as any}
            style={{ width: '100%', height: '360px' }}
            config={{ displayModeBar: false, responsive: true }}
          />
        </section>

      </div>

      {/* ── Historical Crises Bar Chart ────────────────────────────────────── */}
      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <SectionHeader title="Historischer Krisentest" badge="Echte Kursdaten" />

        {validCrises.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>
            Keine historischen Daten für die Krisenperioden vorhanden.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0 }}>
            {/* Bar chart */}
            {/* @ts-ignore */}
            <Plot
              data={[{
                x: validCrises.map(c => `${c.emoji} ${c.name}`),
                y: validCrises.map(c => c.return),
                type: 'bar',
                marker: {
                  color: crisisColors,
                  line: { width: 0 },
                  opacity: 0.9,
                },
                text: validCrises.map(c => (c.return > 0 ? '+' : '') + c.return.toFixed(1) + '%'),
                textposition: 'outside',
                textfont: { size: 13, color: textColor, family: 'inherit' },
                hovertemplate: '<b>%{x}</b><br>Performance: %{y:.2f}%<extra></extra>',
              }]}
              layout={{
                autosize: true,
                margin: { t: 40, l: 60, r: 30, b: 100 },
                paper_bgcolor: paperBg,
                plot_bgcolor: paperBg,
                font: { family: 'inherit', color: textColor, size: 12 },
                xaxis: {
                  showgrid: false,
                  zeroline: false,
                  tickfont: { size: 12 },
                },
                yaxis: {
                  title: 'Portfolio-Rendite (%)',
                  showgrid: true,
                  gridcolor: gridColor,
                  ticksuffix: '%',
                  zeroline: true,
                  zerolinecolor: theme === 'dark' ? '#475569' : '#94a3b8',
                  zerolinewidth: 1.5,
                },
                bargap: 0.35,
                shapes: [{
                  type: 'line',
                  x0: -0.5,
                  x1: validCrises.length - 0.5,
                  y0: 0,
                  y1: 0,
                  line: { color: theme === 'dark' ? '#475569' : '#94a3b8', width: 1, dash: 'dot' },
                }],
              } as any}
              style={{ width: '100%', height: '320px' }}
              config={{ displayModeBar: false, responsive: true }}
            />

            {/* Side legend / info panels */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '24px 24px 24px 0',
              minWidth: '180px',
              justifyContent: 'center',
            }}>
              {validCrises.map((c, i) => (
                <div key={i} style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: c.return >= 0
                    ? (theme === 'dark' ? 'rgba(74,222,128,0.07)' : 'rgba(22,163,74,0.06)')
                    : (theme === 'dark' ? 'rgba(248,113,113,0.07)' : 'rgba(220,38,38,0.06)'),
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, opacity: 0.55, marginBottom: '2px' }}>
                    {c.emoji} {c.name}
                  </div>
                  <div style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    color: (theme === 'dark' ? '#f87171' : '#dc2626'),
                  }}>
                    {c.return.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
