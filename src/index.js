import fs from 'fs';
import path from 'path';
import { fetchBingxTickers, fetchKlines } from './bingx_api.js';
import { detectSteadyClimb } from './strategy_steady_climb.js';
import { sendTelegramMessage, sendDiscordMessage } from './notifier.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'rank_snapshot.json');
const PUSH_AUDIT_FILE = path.join(DATA_DIR, 'push_audit.log');

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

function appendPushAudit(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(PUSH_AUDIT_FILE, `${JSON.stringify(entry)}\n`);
}

function formatSignedPct(v, digits = 2) {
  const n = Number(v || 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function formatVolume(v) {
  const n = Number(v || 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function calcVolumeChangePct(candles) {
  if (!Array.isArray(candles) || candles.length < 21) return 0;
  const vols = candles.map(c => Number(c.volume || 0));
  const current = vols[vols.length - 1] || 0;
  const base = vols.slice(Math.max(0, vols.length - 21), vols.length - 1);
  const avg = base.length ? base.reduce((s, v) => s + v, 0) / base.length : 0;
  if (avg <= 0) return 0;
  return ((current - avg) / avg) * 100;
}

function classifyPotentialByVolume(changePct) {
  if (changePct >= 40) return '正在噴發 (預測正確)';
  if (changePct >= 15) return '蓄勢待發 (可以入場)';
  return '潛力種子 (等待驗證)';
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
  // Align ranking with BingX U-margined contracts list by 24h change%.
  const sortedTickers = tickers.sort((a, b) => (b.change || 0) - (a.change || 0));
  const rankByBase = new Map(sortedTickers.map((t, idx) => [t.base, idx + 1]));

  const scanTargets = sortedTickers.slice(0, topN);
  if (scanTargets.length === 0) return;

  const climbers = [];
  for (const t of scanTargets) {
    const candles = await fetchKlines(t.base, '15m', 40).catch(() => []);
    const climb = detectSteadyClimb(candles);
    if (!climb.steady) continue;
    const volumeChangePct = calcVolumeChangePct(candles);
    climbers.push({ t, climb, rank: Number(rankByBase.get(t.base) || 0), volumeChangePct });
  }
  if (climbers.length === 0) return;

  const prevSnapshot = loadSnapshot();
  const nextSnapshot = {};
  const lines = [];

  climbers.slice(0, 10).forEach((row, idx) => {
    const sym = row.t.base;
    const prevRank = Number(prevSnapshot[sym]?.rank || 0);
    const prevSignalCount = Number(prevSnapshot[sym]?.signalCount || 0);
    const rankMove = prevRank ? (prevRank - row.rank) : 0;
    const rankMoveText = prevRank
      ? (rankMove === 0 ? '不變' : (rankMove > 0 ? `上升 ${rankMove}` : `下降 ${Math.abs(rankMove)}`))
      : '不變';

    lines.push(
      `${idx + 1}. ${sym}  5m${formatSignedPct(row.t.change5m)}  #${row.rank}（${rankMoveText}）`
    );

    nextSnapshot[sym] = {
      rank: row.rank,
      change: Number(row.t.change || 0),
      signalCount: prevSignalCount + 1,
      ts: now
    };
  });

  const potentialRows = climbers
    .filter(row => Number(row.volumeChangePct || 0) > 5)
    .sort((a, b) => Number(b.volumeChangePct || 0) - Number(a.volumeChangePct || 0))
    .slice(0, 10)
    .map((row) => {
      const sym = row.t.base;
      const signalCount = Number(nextSnapshot[sym]?.signalCount || 1);
      const stage = classifyPotentialByVolume(Number(row.volumeChangePct || 0));
      return { sym, signalCount, stage, volumeChangePct: Number(row.volumeChangePct || 0) };
    });

  const buildupRows = potentialRows.filter(r => r.stage === '蓄勢待發 (可以入場)');
  const eruptingRows = potentialRows.filter(r => r.stage === '正在噴發 (預測正確)');
  const potentialSections = [];
  if (buildupRows.length) {
    potentialSections.push(
      `蓄勢待發：\n${buildupRows.map((r, i) => `${i + 1}. ${r.sym}  量能 ${formatSignedPct(r.volumeChangePct)}  信號次數 ${r.signalCount}`).join('\n')}`
    );
  }
  if (eruptingRows.length) {
    potentialSections.push(
      `正在噴發：\n${eruptingRows.map((r, i) => `${i + 1}. ${r.sym}  量能 ${formatSignedPct(r.volumeChangePct)}  信號次數 ${r.signalCount}`).join('\n')}`
    );
  }

  const stableLeader = [...climbers].sort((a, b) => b.climb.r2 - a.climb.r2)[0];
  const momentumLeader = [...climbers].sort((a, b) => b.climb.slopePct - a.climb.slopePct)[0];

  const msg = `📊 **穩定爬升清單（共 ${climbers.length} 檔）**\n`
    + `————————————\n`
    + `${lines.join('\n')}\n\n`
    + `${potentialSections.length ? `🔥 **具備潛力標的（15m 量能變化 > 5%）**\n\n${potentialSections.join('\n\n')}\n\n` : ''}`
    + `🏆 **領先標的**\n`
    + `- 穩定度最佳：${stableLeader.t.base}（R² = ${stableLeader.climb.r2.toFixed(2)}）\n`
    + `- 動能最強：${momentumLeader.t.base}（+${momentumLeader.climb.slopePct.toFixed(3)}% / bar）`;

  const eventBase = {
    at: new Date(now).toISOString(),
    type: 'rank_push',
    climbers: climbers.length
  };

  try {
    await sendTelegramMessage(msg);
    appendPushAudit({ ...eventBase, channel: 'telegram', ok: true });
  } catch (e) {
    appendPushAudit({ ...eventBase, channel: 'telegram', ok: false, error: String(e?.message || e) });
    console.error('[RANK] telegram push error:', e.message);
  }

  try {
    await sendDiscordMessage(msg);
    appendPushAudit({ ...eventBase, channel: 'discord', ok: true });
  } catch (e) {
    appendPushAudit({ ...eventBase, channel: 'discord', ok: false, error: String(e?.message || e) });
    console.error('[RANK] discord push error:', e.message);
  }

  saveSnapshot(nextSnapshot);
  lastPushAt = now;
  console.log(`[RANK] pushed ${climbers.length} climbers at ${new Date(now).toISOString()}`);
}

setInterval(() => {
  loopRankPush().catch(e => console.error('[RANK] loop error:', e.message));
}, 60 * 1000);

console.log('[RANK] rank climber bot started');
loopRankPush().catch(e => console.error('[RANK] initial run error:', e.message));
