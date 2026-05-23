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
