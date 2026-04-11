# Prediction Market App

This repository contains a full-stack prediction market web application built from the provided starter and extended to cover the requested product tasks.

## What The Project Is Today

The app supports:
- User registration and login with JWT authentication
- Market creation and betting
- Live market odds updates (polling every few seconds)
- Dashboard filtering, sorting, and pagination
- Profile page with active and resolved bets
- Market detail odds chart and bet placement flow
- Leaderboard by net profit from resolved markets
- Admin role and admin-only market controls
- Market resolution with proportional payout distribution
- Market archive flow with full bettor refunds
- User balance tracking (deduct on bet, credit on payout/refund)

## Tech Stack

### Backend
- Bun + Elysia
- SQLite with Drizzle ORM
- JWT auth middleware

### Frontend
- React 19 + TanStack Router (file-based routes)
- Tailwind CSS + shadcn UI primitives
- API access through same-origin proxy routes under client-side `/api/*`

### Runtime
- Docker Compose (recommended)

## Quick Start

### 1. Run with Docker Compose

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:3005`
- Backend: `http://localhost:4005`

### 2. Local development without Docker (optional)

```bash
# backend
cd server
bun install
bun run dev

# frontend
cd client
bun install
bun run dev
```

## Implemented Requirements (Tasks 1-8)

## 1. Main Dashboard
Implemented:
- Displays markets with title, outcomes, odds, and total market value
- Sort by creation date, total bets, and participants
- Filter by status (`active`, `resolved`, `archived`, `all`)
- Pagination at 20 items per page
- Auto-refresh for near real-time odds/totals

Main files:
- `client/src/routes/index.tsx`
- `client/src/components/market-card.tsx`
- `server/src/api/handlers.ts` (`handleListMarkets`)
- `server/src/api/markets.routes.ts`

## 2. User Profile Page
Implemented:
- Separate sections for active bets and resolved bets
- Resolved section shows win/loss state
- Active section shows current live odds
- Independent pagination for each section (20/page)
- Periodic refresh for active data and current balance

Main files:
- `client/src/routes/profile.tsx`
- `server/src/api/handlers.ts` (`handleListMyBets`)
- `server/src/api/users.routes.ts`

## 3. Market Detail Page
Implemented:
- Market odds and totals per outcome
- Odds history chart rendered from API snapshots
- Outcome selection + amount input for betting
- Positive-number validation before submit
- Estimated payout preview
- Live refresh while market is active

Main files:
- `client/src/routes/markets/$id.tsx`
- `server/src/api/handlers.ts` (`handleGetMarket`, `handleGetMarketOddsHistory`, `handlePlaceBet`)
- `server/src/api/markets.routes.ts`

## 4. Leaderboard
Implemented:
- Leaderboard endpoint and page
- Ranking by net profit over resolved markets
- Shows user stats and totals
- Pagination at 20/page

Main files:
- `client/src/routes/leaderboard.tsx`
- `client/src/routes/api/users/leaderboard.tsx`
- `server/src/api/handlers.ts` (`handleGetLeaderboard`)
- `server/src/api/users.routes.ts`

## 5. Role System
Implemented:
- `user` / `admin` role support
- First account elevated to admin (with startup safety fallback if no admin exists)
- Role included in auth responses and client auth state
- Admin-only controls shown in UI where applicable

Main files:
- `server/src/db/schema.ts`
- `server/src/api/handlers.ts` (`handleRegister`, `handleLogin`)
- `server/docker-entrypoint.sh`
- `client/src/lib/auth-context.tsx`
- `client/src/routes/index.tsx`
- `client/src/routes/markets/$id.tsx`

## 6. Admin Market Resolution
Implemented:
- Admin can resolve market by selecting winning outcome
- Admin can archive active market
- Archive action performs full refunds to bettors
- Access protected by admin role checks

Main files:
- `server/src/api/handlers.ts` (`handleResolveMarket`, `handleArchiveMarket`)
- `server/src/api/markets.routes.ts`
- `server/src/db/schema.ts` (`market_refunds`)
- `client/src/routes/markets/$id.tsx`
- `client/src/routes/api/markets/$id/resolve.tsx`
- `client/src/routes/api/markets/$id/archive.tsx`

## 7. Payout Distribution
Implemented:
- On resolve, winners are identified by matching resolved outcome
- Total pool distributed proportionally by winner stake
- Payout records stored
- Winner balances credited transactionally

Main files:
- `server/src/api/handlers.ts` (`handleResolveMarket`)
- `server/src/db/schema.ts` (`market_payouts`)
- `server/docker-entrypoint.sh`

## 8. User Balance Tracking
Implemented:
- Users have balance (default initial value: 1000)
- Bet placement deducts balance
- Resolve payouts add to balance
- Archive refunds add to balance
- Auth/profile/dashboard/market views refresh and show current balance
- Added `/api/users/me` endpoint for current user state

Main files:
- `server/src/db/schema.ts` (`users.balance`)
- `server/src/api/handlers.ts` (`handlePlaceBet`, `handleResolveMarket`, `handleArchiveMarket`, `handleGetCurrentUser`)
- `server/src/api/users.routes.ts`
- `client/src/lib/api.ts`
- `client/src/lib/auth-context.tsx`
- `client/src/routes/index.tsx`
- `client/src/routes/profile.tsx`
- `client/src/routes/markets/$id.tsx`
- `client/src/routes/api/users/me.tsx`

## API Highlights

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`

Markets:
- `GET /api/markets`
- `GET /api/markets/:id`
- `GET /api/markets/:id/odds-history`
- `POST /api/markets`
- `POST /api/markets/:id/bets`
- `POST /api/markets/:id/resolve` (admin)
- `POST /api/markets/:id/archive` (admin)

Users:
- `GET /api/users/me`
- `GET /api/users/me/bets`
- `GET /api/users/leaderboard`

## Tests and Validation

Backend test coverage includes:
- Auth flows and validation
- Market creation/list/detail
- Betting validation
- Admin role restrictions
- Resolve/archive behavior
- Payout and refund calculations
- Balance lifecycle checks

Primary test file:
- `server/test/api.test.ts`

## Notes

- Real-time behavior is currently implemented with short-interval polling.
- Bonus API-key feature is not implemented in this iteration.
- If you see a local editor-only TS warning around `import.meta.env`, runtime/container builds remain functional.

## Submission Artifacts

See:
- `submission/README.md`
- `assets/` for visuals used during development/demo
