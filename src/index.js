import fs from 'fs';
import path from 'path';
import { fetchBingxTickers, fetchKlines } from './bingx_api.js';
import { detectSteadyClimb } from './strategy_steady_climb.js';
import { sendTelegramMessage, sendDiscordMessage } from './notifier.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'rank_snapshot.json');

function loadSnapshot() {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return {};
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function saveSnapshot(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(obj, null, 2));
}

let lastPushAt = 0;

async function loopRankPush() {
  const enabled = String(process.env.ENABLE_RANK_PUSH || 'true').toLowerCase() === 'true';
  if (!enabled) return;

  const intervalMs = Number(process.env.RANK_PUSH_INTERVAL_MINUTES || 5) * 60 * 1000;
  const now = Date.now();
  if (now - lastPushAt < intervalMs) return;

  const topN = Number(process.env.RANK_PUSH_TOP_N || 30);
  const tickers = await fetchBingxTickers();
  const ranked = tickers.sort((a, b) => (b.volVelocity || 0) - (a.volVelocity || 0)).slice(0, topN);
  if (ranked.length === 0) return;

  const climbers = [];
  for (let i = 0; i < ranked.length; i++) {
    const t = ranked[i];
    const candles = await fetchKlines(t.base, '15m', 40).catch(() => []);
    const climb = detectSteadyClimb(candles);
    if (!climb.steady) continue;
    climbers.push({ t, climb, rank: i + 1 });
  }
  if (climbers.length === 0) return;

  const prevSnapshot = loadSnapshot();
  const nextSnapshot = {};
  const lines = [];
  climbers.slice(0, 10).forEach((row, idx) => {
    const sym = row.t.base;
    const prevRank = Number(prevSnapshot[sym]?.rank || 0);
    const rankText = prevRank
      ? (prevRank === row.rank ? `(維持 #${row.rank})` : (row.rank < prevRank ? `(↑ 由 #${prevRank})` : `(↓ 由 #${prevRank})`))
      : '(新進榜)';
    const oi = Number(row.t.oiChangePct ?? 0);
    const chasingRisk = row.t.change > 3 ? ' ⚠️ 追價風險' : '';
    lines.push(`${idx + 1}. ${sym}  ${Number(row.t.price || 0).toFixed(6)}  ${(row.t.change >= 0 ? '+' : '')}${Number(row.t.change || 0).toFixed(2)}%  #${row.rank} ${rankText} | OI ${(oi >= 0 ? '+' : '')}${oi.toFixed(2)}%${chasingRisk}`);
    nextSnapshot[sym] = { rank: row.rank, ts: now };
  });

  const avgR2 = climbers.reduce((s, r) => s + r.climb.r2, 0) / climbers.length;
  const avgSlope = climbers.reduce((s, r) => s + r.climb.slopePct, 0) / climbers.length;
  const avgHigherLows = climbers.reduce((s, r) => s + r.climb.higherLows, 0) / climbers.length;
  const stableLeader = [...climbers].sort((a, b) => b.climb.r2 - a.climb.r2)[0];
  const momentumLeader = [...climbers].sort((a, b) => b.climb.slopePct - a.climb.slopePct)[0];

  const msg = `📊 **穩定爬升清單（共 ${climbers.length} 檔）**\n` +
    `━━━━━━━━━━━━━━\n` +
    `${lines.join('\n')}\n\n` +
    `📈 **統計**\n` +
    `- 平均 R²：${avgR2.toFixed(2)}\n` +
    `- 平均斜率：${avgSlope.toFixed(3)}% / bar\n` +
    `- 平均抬高低點數：${avgHigherLows.toFixed(1)}\n\n` +
    `🏆 **領先標的**\n` +
    `- 穩定度最佳：${stableLeader.t.base}（R² = ${stableLeader.climb.r2.toFixed(2)}）\n` +
    `- 動能最強：${momentumLeader.t.base}（+${momentumLeader.climb.slopePct.toFixed(3)}% / bar）`;

  await sendTelegramMessage(msg);
  await sendDiscordMessage(msg);

  saveSnapshot(nextSnapshot);
  lastPushAt = now;
  console.log(`[RANK] pushed ${climbers.length} climbers at ${new Date(now).toISOString()}`);
}

setInterval(() => {
  loopRankPush().catch(e => console.error('[RANK] loop error:', e.message));
}, 60 * 1000);

console.log('[RANK] rank climber bot started');
loopRankPush().catch(e => console.error('[RANK] initial run error:', e.message));
