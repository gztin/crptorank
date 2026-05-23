# Rank Climber Bot

## Purpose
This repo runs only the leaderboard steady-climb summary push.
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
1. Entry and scheduler (`src/index.js`)
- Runs `loopRankPush()` every 1 minute.
- Only pushes when `RANK_PUSH_INTERVAL_MINUTES` has elapsed.

2. Market data provider (`src/bingx_api.js`)
- `fetchBingxTickers()` fetches BingX swap tickers.
- Scan universe is strictly U-margined perpetual contracts (`*-USDT`).
- `fetchKlines(base, interval, limit)` fetches kline candles.

3. Strategy evaluator (`src/strategy_steady_climb.js`)
- `detectSteadyClimb(candles)` computes slope, slope%, R2, and higher-low count.
- A symbol is considered steady climb when:
  - `slope > 0`
  - `r2 > 0.6`
  - `higherLows >= 2`

4. Notification output (`src/notifier.js`)
- Sends formatted summary message to Telegram and optional Discord webhook.

## Ranking Definition
- `#rank` means the symbol position inside the fetched BingX U-margined perpetual ticker set.
- Ranking is computed internally by sorting `24h priceChangePercent` in descending order.
- Scan targets are exactly top `RANK_PUSH_TOP_N` symbols from this ranking.
- Mainstream symbols are not force-included.
- Rank movement is tracked against previous push snapshot.

## Push Message Format
1. Header
- `📊 **穩定爬升清單（共 N 檔）**`

2. Ranked lines (top 10 display)
- `{listIndex}. {SYMBOL}  5m{+/-CHANGE%}  #{CURRENT_RANK}（{RANK_MOVE_TEXT}）`
- `RANK_MOVE` values:
  - `上升 N`
  - `下降 N`
  - `不變`
- OI information is removed from push lines.

3. Potential candidates section
- Header: `🔥 **具備潛力標的（24h 漲幅 > 10%）**`
- Grouped display format:
  - `蓄勢待發：` then list symbols
  - `正在噴發：` then list symbols
  - each line: `{listIndex}. {SYMBOL}  量能 {+/-VOLUME_CHANGE%}  信號次數 {SIGNAL_COUNT}`
- `SIGNAL_COUNT` is accumulated per symbol from snapshot history.

4. Statistics and leaders
- Average R²
- Average slope (% / bar)
- Average higher-lows
- Stability leader (highest R²)
- Momentum leader (highest slope%)
