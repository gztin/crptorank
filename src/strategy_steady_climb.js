function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function detectSteadyClimb(candles) {
  const result = { steady: false, slope: 0, slopePct: 0, r2: 0, higherLows: 0 };
  if (!Array.isArray(candles) || candles.length < 10) return result;

  const closes = candles.map(c => toNum(c.close));
  const lows = candles.map(c => toNum(c.low));
  const n = closes.length;
  const xMean = (n - 1) / 2;
  const yMean = closes.reduce((s, v) => s + v, 0) / n;

  let ssXX = 0;
  let ssXY = 0;
  for (let i = 0; i < n; i++) {
    ssXX += (i - xMean) ** 2;
    ssXY += (i - xMean) * (closes[i] - yMean);
  }
  const slope = ssXX > 0 ? ssXY / ssXX : 0;
  const intercept = yMean - slope * xMean;

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const p = intercept + slope * i;
    ssTot += (closes[i] - yMean) ** 2;
    ssRes += (closes[i] - p) ** 2;
  }
  const r2 = ssTot > 0 ? (1 - ssRes / ssTot) : 0;

  let higherLowCount = 0;
  for (let i = 1; i < lows.length; i++) {
    if (lows[i] > lows[i - 1]) higherLowCount++;
  }

  const slopePct = closes[0] > 0 ? (slope / closes[0]) * 100 : 0;
  result.slope = slope;
  result.slopePct = slopePct;
  result.r2 = r2;
  result.higherLows = higherLowCount;
  result.steady = slope > 0 && r2 > 0.6 && higherLowCount >= 2;
  return result;
}
