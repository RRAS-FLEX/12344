# Reliability Baseline (P1/P2 + Uptime)

## Alert Thresholds
- **P1 (critical):** booking confirm failures >= 5 in 5 minutes, app unavailable > 2 minutes, or Supabase API outage.
- **P2 (high):** booking/read API error rate >= 5% for 10 minutes, or sustained latency > 2 seconds p95.

## Alert Channels
- **P1 channel:** phone/on-call + Slack `#nautiplex-incidents`.
- **P2 channel:** Slack `#nautiplex-ops` + email digest to operations owners.

## Uptime Check Command
- Run local check:
  - `npm run check:uptime`
- Optional env vars:
  - `APP_HEALTH_URL` (default `http://localhost:8080/`)
  - `UPTIME_TIMEOUT_MS` (default `6000`)
  - `SUPABASE_URL` or `VITE_SUPABASE_URL`
  - `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`

## Current Implementation Notes
- Booking realtime updates are implemented in `src/pages/Booking.tsx` via Supabase channel subscriptions.
- Core read paths already use retry/backoff via `src/lib/retry.ts` and callsites in list/detail pages.
- This file is the baseline; production alert routing should be mirrored in your monitoring platform.

