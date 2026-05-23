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
- Ranking is computed internally by sorting `volume` in descending order.
- Rank movement is tracked against previous push snapshot.

## Push Message Format
1. Header
- `📊 **穩定爬升清單（共 N 檔）**`

2. Ranked lines (top 10 display)
- `{listIndex}. {SYMBOL}  {PRICE}  {+/-DELTA_FROM_PREV_PUSH%} | U本位名次 #{CURRENT_RANK} ({RANK_MOVE})`
- `DELTA_FROM_PREV_PUSH%` = current `priceChangePercent` - previous pushed `priceChangePercent`.
- `RANK_MOVE` values:
  - `NEW`
  - `0`
  - `+N`
  - `-N`
- OI information is removed from push lines.

3. Statistics and leaders
- Average R²
- Average slope (% / bar)
- Average higher-lows
- Stability leader (highest R²)
- Momentum leader (highest slope%)
