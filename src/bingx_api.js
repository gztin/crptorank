const BINGX_API = 'https://open-api.bingx.com';

async function jget(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchBingxTickers() {
  const data = await jget(`${BINGX_API}/openApi/swap/v2/quote/ticker`);
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .filter(r => String(r.symbol || '').endsWith('-USDT'))
    .map(r => ({
      symbol: r.symbol,
      base: String(r.symbol).replace('-USDT', ''),
      price: Number(r.lastPrice || 0),
      change: Number(r.priceChangePercent || 0),
      volVelocity: Number(r.volume || 0),
      oiChangePct: Number(r.openInterestChangePercent || 0)
    }));
}

export async function fetchKlines(base, interval = '15m', limit = 40) {
  const symbol = `${base}-USDT`;
  const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
  const data = await jget(`${BINGX_API}/openApi/swap/v3/quote/klines?${q}`);
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.map(r => ({
    open: Number(r.open || 0),
    high: Number(r.high || 0),
    low: Number(r.low || 0),
    close: Number(r.close || 0)
  }));
}
