export interface ProcessedData {
  logReturns: number[];
  annualizedVolatility: number;
}

export function calculateLogReturns(data: { close: number }[]): ProcessedData {
  const logReturns: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1].close;
    const curr = data[i].close;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  // Calculate standard deviation of returns
  let mean = 0;
  if (logReturns.length > 0) {
    mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
  }

  let variance = 0;
  if (logReturns.length > 1) {
    variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
  }

  const dailyVolatility = Math.sqrt(variance);
  const annualizedVolatility = dailyVolatility * Math.sqrt(252);

  return { logReturns, annualizedVolatility };
}

export function calculateHistoricalVaR(returns: number[], confidenceLevel: number = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.max(0, Math.floor(sorted.length * (1 - confidenceLevel)));
  return sorted[index] ?? 0;
}

function randomNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function generateGBMPaths(
  S0: number,
  mu: number,
  sigma: number,
  days: number,
  numPaths: number
): { pathId: string; data: { step: number; price: number }[] }[] {
  const dt = 1 / 252; // daily steps
  const paths = [];

  for (let p = 0; p < numPaths; p++) {
    const pathData = [{ step: 0, price: S0 }];
    let currentS = S0;

    for (let t = 1; t <= days; t++) {
      const z = randomNormal();
      currentS = currentS * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
      pathData.push({ step: t, price: currentS });
    }
    paths.push({ pathId: `Path ${p + 1}`, data: pathData });
  }

  return paths;
}

// Normal CDF
function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Normal PDF
function normPDF(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

export function blackScholes(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0) T = 0.0001;
  if (sigma <= 0) sigma = 0.0001;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const callPrice = S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  const putPrice = K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);

  // Call Greeks
  const deltaCall = normCDF(d1);
  const gamma = normPDF(d1) / (S * sigma * Math.sqrt(T));
  const vega = S * normPDF(d1) * Math.sqrt(T) / 100;
  const thetaCall = (-(S * normPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCDF(d2)) / 365;

  const deltaPut = deltaCall - 1;
  const thetaPut = (-(S * normPDF(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365;

  return { callPrice, putPrice, deltaCall, deltaPut, gamma, vega, thetaCall, thetaPut };
}

export function getStrategyPayoff(
  S: number,
  spots: number[],
  strategy: 'Long Call' | 'Straddle' | 'Bull Call Spread'
): { spot: number; pnl: number }[] {
  const data = [];

  for (const x of spots) {
    let pnl = 0;
    const premiumFactor = Math.max(1, S * 0.05);

    if (strategy === 'Long Call') {
      const strike = S;
      pnl = Math.max(0, x - strike) - premiumFactor;
    } else if (strategy === 'Straddle') {
      const strike = S;
      pnl = Math.max(0, x - strike) + Math.max(0, strike - x) - (premiumFactor * 2);
    } else if (strategy === 'Bull Call Spread') {
      const strike1 = S;
      const strike2 = S * 1.05;
      const premium1 = premiumFactor;
      const premium2 = premiumFactor * 0.5;

      const longCall = Math.max(0, x - strike1) - premium1;
      const shortCall = -(Math.max(0, x - strike2)) + premium2;
      pnl = longCall + shortCall;
    }

    data.push({ spot: x, pnl });
  }

  return data;
}

export function calculateCorrelationMatrix(
  seriesMap: Record<string, { date?: string; time?: string; value?: number; price?: number }[]>
): { x: string; y: string; value: number }[] {
  const keys = Object.keys(seriesMap);
  const matrix = [];
  
  for (const assetX of keys) {
    for (const assetY of keys) {
      if (assetX === assetY) {
        matrix.push({ x: assetX, y: assetY, value: 1.0 });
      } else {
        const dataX = seriesMap[assetX] || [];
        const dataY = seriesMap[assetY] || [];

        // Build robust map for X using YYYY-MM as key
        const mapX = new Map<string, number>();
        for (const pt of dataX) {
          const rawD = pt.date ?? pt.time;
          const v = pt.value ?? pt.price;
          if (rawD && v !== undefined && v > 0) {
            // Standardize date to YYYY-MM for monthly alignment
            const d = rawD.substring(0, 7);
            mapX.set(d, v);
          }
        }

        const ra: number[] = [];
        const rb: number[] = [];

        // Align returns based on common dates in Y
        const sortedY = [...dataY]
          .filter(p => (p.date ?? p.time) && (p.value ?? p.price ?? 0) > 0)
          .sort((a,b) => (a.date ?? a.time ?? "").localeCompare(b.date ?? b.time ?? ""));
        
        for (let i = 1; i < sortedY.length; i++) {
          const dCurr = (sortedY[i].date ?? sortedY[i].time ?? "").substring(0, 7);
          const dPrev = (sortedY[i-1].date ?? sortedY[i-1].time ?? "").substring(0, 7);
          
          if (mapX.has(dCurr) && mapX.has(dPrev)) {
            const currX = mapX.get(dCurr)!;
            const prevX = mapX.get(dPrev)!;
            const currY = sortedY[i].value ?? sortedY[i].price!;
            const prevY = sortedY[i-1].value ?? sortedY[i-1].price!;

            ra.push(Math.log(currX / prevX));
            rb.push(Math.log(currY / prevY));
          }
        }

        const len = ra.length;
        if (len < 5) { // Require some overlapping periods
          matrix.push({ x: assetX, y: assetY, value: 0 });
          continue;
        }

        const meanA = ra.reduce((a, b) => a + b, 0) / len;
        const meanB = rb.reduce((a, b) => a + b, 0) / len;

        let num = 0;
        let denA = 0;
        let denB = 0;
        for (let i = 0; i < len; i++) {
          const diffA = ra[i] - meanA;
          const diffB = rb[i] - meanB;
          num += diffA * diffB;
          denA += diffA * diffA;
          denB += diffB * diffB;
        }

        const den = Math.sqrt(denA * denB);
        const corr = den === 0 ? 0 : num / den;
        matrix.push({ x: assetX, y: assetY, value: isNaN(corr) ? 0 : Math.max(-1, Math.min(1, corr)) });
      }
    }
  }
  return matrix;
}

export function calculateBeta(assetReturns: number[], benchmarkReturns: number[]): number {
  const len = Math.min(assetReturns.length, benchmarkReturns.length);
  if (len < 2) return 1;

  const ra = assetReturns.slice(-len);
  const rb = benchmarkReturns.slice(-len);

  const meanA = ra.reduce((a, b) => a + b, 0) / len;
  const meanB = rb.reduce((a, b) => a + b, 0) / len;

  let covariance = 0;
  let varianceB = 0;

  for (let i = 0; i < len; i++) {
    covariance += (ra[i] - meanA) * (rb[i] - meanB);
    varianceB += (rb[i] - meanB) * (rb[i] - meanB);
  }

  covariance /= (len - 1);
  varianceB /= (len - 1);

  if (varianceB <= 0) return 1;
  return covariance / varianceB;
}

export function calculateAlignedBeta(
  assetData: { date: string; value: number }[],
  benchmarkData: { date: string; value: number }[]
): number {
  const benchMap = new Map<string, number>();
  for (const b of benchmarkData) {
    if (!b.date) continue;
    const yyyymm = b.date.substring(0, 7);
    benchMap.set(yyyymm, b.value);
  }

  const alignedAsset: number[] = [];
  const alignedBench: number[] = [];

  for (const a of assetData) {
    if (!a.date) continue;
    const yyyymm = a.date.substring(0, 7);
    if (benchMap.has(yyyymm)) {
      alignedAsset.push(a.value);
      alignedBench.push(benchMap.get(yyyymm)!);
    }
  }

  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < alignedAsset.length; i++) {
    const prevA = alignedAsset[i - 1];
    const prevB = alignedBench[i - 1];
    const currA = alignedAsset[i];
    const currB = alignedBench[i];

    if (prevA > 0 && currA > 0 && prevB > 0 && currB > 0) {
      ra.push(Math.log(currA / prevA));
      rb.push(Math.log(currB / prevB));
    }
  }

  const len = ra.length;
  if (len < 2) return 0;

  const meanA = ra.reduce((a, b) => a + b, 0) / len;
  const meanB = rb.reduce((a, b) => a + b, 0) / len;

  let covariance = 0;
  let varianceB = 0;

  for (let i = 0; i < len; i++) {
    covariance += (ra[i] - meanA) * (rb[i] - meanB);
    varianceB += (rb[i] - meanB) * (rb[i] - meanB);
  }

  covariance /= (len - 1);
  varianceB /= (len - 1);

  if (varianceB <= 0) return 0;
  return covariance / varianceB;
}

export type EquityPoint = { date: string, value: number };

export function calculatePortfolioEquityCurve(
  datasetSeries: Record<string, any[]>,
  selectedTickers: string[],
  weights: Record<string, number | null>
): EquityPoint[] {
  if (selectedTickers.length === 0) return [];

  // Normalize weights
  const sumW = Object.values(weights).reduce((acc: number, w) => acc + (w || 0), 0) || 1;
  const normalizedWeights: Record<string, number> = {};
  for (const t of selectedTickers) {
    normalizedWeights[t] = ((weights[t] ?? 0) / sumW);
  }

  // Map dates
  const datesSet = new Set<string>();
  const assetTSS = new Map<string, Map<string, number>>();

  for (const t of selectedTickers) {
    const series = datasetSeries[t] || [];
    const dateMap = new Map<string, number>();
    for (const p of series) {
      const d = p.date ?? p.time;
      const v = p.price ?? p.value;
      if (d && v > 0) {
        // substring to YYYY-MM to standardize (month-end resampling implicitly)
        const yyyymm = d.substring(0, 7) + "-01"; // represent as 1st of month
        dateMap.set(yyyymm, v);
        datesSet.add(yyyymm);
      }
    }
    assetTSS.set(t, dateMap);
  }

  // Find common dates (inner join)
  const commonDates = Array.from(datesSet).filter(d => {
    return selectedTickers.every(t => assetTSS.get(t)?.has(d));
  }).sort();

  if (commonDates.length === 0) return [];

  // Calculate base values (first common date prices = 100 base)
  const initialPrices: Record<string, number> = {};
  for (const t of selectedTickers) {
    initialPrices[t] = assetTSS.get(t)!.get(commonDates[0])!;
  }

  const equityCurve: EquityPoint[] = [];

  for (const d of commonDates) {
    let portfolioValue = 0;
    for (const t of selectedTickers) {
      const currentPrice = assetTSS.get(t)!.get(d)!;
      const initialPrice = initialPrices[t];
      const perf = currentPrice / initialPrice; // return ratio
      const w = normalizedWeights[t];
      portfolioValue += (w * 100 * perf);
    }
    equityCurve.push({ date: d, value: portfolioValue });
  }

  return equityCurve;
}

export function calculateDrawdowns(equityCurve: EquityPoint[]): { drawdowns: EquityPoint[], maxDrawdown: number } {
  let peak = -Infinity;
  let maxDrawdown = 0;
  const drawdowns: EquityPoint[] = [];

  for (const pt of equityCurve) {
    if (pt.value > peak) {
      peak = pt.value;
    }
    const dd = peak > 0 ? (pt.value - peak) / peak : 0;
    if (dd < maxDrawdown) {
      maxDrawdown = dd;
    }
    drawdowns.push({ date: pt.date, value: dd * 100 });
  }

  return { drawdowns, maxDrawdown: maxDrawdown * 100 };
}

export function calculateRiskKPIs(equityCurve: EquityPoint[], riskFreeRate: number = 0.02) {
  if (equityCurve.length < 2) return { sharpe: 0, sortino: 0, annVol: 0, annReturn: 0 };

  const logReturns: number[] = [];
  const downReturns: number[] = [];

  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value;
    const curr = equityCurve[i].value;
    if (prev > 0) {
      const ret = Math.log(curr / prev);
      logReturns.push(ret);
      if (ret < 0) downReturns.push(ret);
    }
  }

  const len = logReturns.length;
  // Mean Monthly Return (assuming monthly data points due to YYYY-MM normalization)
  const meanRet = logReturns.reduce((a, b) => a + b, 0) / len;

  let varRet = 0;
  if (len > 1) {
    varRet = logReturns.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / (len - 1);
  }
  const stdRet = Math.sqrt(varRet);

  const downVar = downReturns.length > 0 ? downReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / downReturns.length : 0.00000001;
  const downStd = Math.sqrt(downVar);

  const monthsPerYear = 12; // Our normalization is monthly
  const annReturn = (Math.exp(meanRet * monthsPerYear) - 1);
  const annVol = stdRet * Math.sqrt(monthsPerYear);
  const annDownStd = downStd * Math.sqrt(monthsPerYear);

  const sharpe = annVol > 0 ? (annReturn - riskFreeRate) / annVol : 0;
  const sortino = annDownStd > 0 ? (annReturn - riskFreeRate) / annDownStd : 0;

  return { sharpe, sortino, annVol: annVol * 100, annReturn: annReturn * 100 };
}

export function calculateRollingBeta(
  assetData: { date: string; value: number }[],
  benchmarkData: { date: string; value: number }[],
  windowMonths: number = 12
): { date: string; value: number }[] {
  const benchMap = new Map<string, number>();
  for (const b of benchmarkData) {
    if (!b.date) continue;
    const yyyymm = b.date.substring(0, 7);
    benchMap.set(yyyymm, b.value);
  }

  const aligned: { date: string, ra: number, rb: number }[] = [];
  const sortedAsset = [...assetData].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 1; i < sortedAsset.length; i++) {
    const prevA = sortedAsset[i - 1].value;
    const currA = sortedAsset[i].value;
    const dateA = sortedAsset[i].date;
    const yyyymm = dateA.substring(0, 7);

    if (benchMap.has(yyyymm)) {
      const prevDate = sortedAsset[i - 1].date.substring(0, 7);
      if (benchMap.has(prevDate)) {
        const prevB = benchMap.get(prevDate)!;
        const currB = benchMap.get(yyyymm)!;
        if (prevA > 0 && currA > 0 && prevB > 0 && currB > 0) {
          aligned.push({
            date: dateA,
            ra: Math.log(currA / prevA),
            rb: Math.log(currB / prevB)
          });
        }
      }
    }
  }

  const result: { date: string; value: number }[] = [];
  if (aligned.length < windowMonths) return [];

  for (let i = windowMonths; i <= aligned.length; i++) {
    const slice = aligned.slice(i - windowMonths, i);
    const ra = slice.map(s => s.ra);
    const rb = slice.map(s => s.rb);

    const len = ra.length;
    const meanA = ra.reduce((a, b) => a + b, 0) / len;
    const meanB = rb.reduce((a, b) => a + b, 0) / len;

    let covariance = 0;
    let varianceB = 0;

    for (let j = 0; j < len; j++) {
      covariance += (ra[j] - meanA) * (rb[j] - meanB);
      varianceB += (rb[j] - meanB) * (rb[j] - meanB);
    }

    covariance /= (len - 1);
    varianceB /= (len - 1);

    const beta = varianceB > 0 ? covariance / varianceB : 1.0;
    result.push({ date: aligned[i - 1].date, value: beta });
  }

  return result;
}
