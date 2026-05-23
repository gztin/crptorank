# Rank Climber Bot

## Purpose
This repo only runs the leaderboard steady-climb summary push.
It does not run full scan/position loops from the main bot.

## Runtime
- Interval check: every 1 minute
- Push interval default: every 5 minutes
- Output: Telegram + Discord rank climber summary

## Required ENV
- `TG_TOKEN`
- `TG_RANK_CLIMBER_CHANNEL_ID`
- `DISCORD_RANK_PUSH_WEBHOOK` (optional)

## Start
```bash
npm run start
```

## Notes
- Snapshot file: `data/rank_snapshot.json`
- Keep secrets out of git; use encrypted env workflow.

## Function Architecture
The bot is organized into 4 functional layers:

1. Entry and scheduler (`src/index.js`)
- Runs `loopRankPush()` every 1 minute.
- Only pushes when `RANK_PUSH_INTERVAL_MINUTES` has elapsed (default: 5 min).

2. Market data provider (`src/bingx_api.js`)
- `fetchBingxTickers()`: fetches BingX swap tickers and normalizes symbol/price/change/volume/open-interest fields.
- `fetchKlines(base, interval, limit)`: fetches kline candles for strategy checks.

3. Strategy evaluator (`src/strategy_steady_climb.js`)
- `detectSteadyClimb(candles)`: computes slope, slope%, R2, and higher-low count.
- A symbol is considered steady climb when:
  - `slope > 0`
  - `r2 > 0.6`
  - `higherLows >= 2`

4. Notification output (`src/notifier.js`)
- Sends formatted summary message to:
  - Telegram (`TG_TOKEN`, `TG_RANK_CLIMBER_CHANNEL_ID`)
  - Discord webhook (`DISCORD_RANK_PUSH_WEBHOOK`, optional)

Additional state handling:
- Snapshot persistence (`data/rank_snapshot.json`) stores previous ranks for rank-change labels:
  - new entry
  - rank up
  - rank down
  - unchanged

## Push Message Format
The pushed message uses Markdown and contains 3 sections:

1. Header
- `📊 **穩定爬升清單（共 N 檔）**`
- Divider line: `━━━━━━━━━━━━━━`

2. Ranked lines (top 10 display)
- Example line format:
- `{listIndex}. {SYMBOL}  {PRICE}  {+/-CHANGE%}  #{CURRENT_RANK} {RANK_CHANGE_TEXT} | OI {+/-OI_CHANGE%}{OPTIONAL_RISK_TAG}`
- `RANK_CHANGE_TEXT` values:
  - `(新進榜)`
  - `(維持 #x)`
  - `(↑ 由 #x)`
  - `(↓ 由 #x)`
- `OPTIONAL_RISK_TAG`:
  - Adds `⚠️ 追價風險` when `change > 3%`.

3. Statistics and leaders
- `📈 **統計**`
  - 平均 R²
  - 平均斜率（% / bar）
  - 平均抬高低點數
- `🏆 **領先標的**`
  - 穩定度最佳（highest R²）
  - 動能最強（highest slope%）
