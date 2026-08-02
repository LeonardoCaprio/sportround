# SportRound

SportRound is a responsive badminton session manager for browsers. A host creates the session, reviews balanced lineups, starts rounds, replaces players, and ends the session. Anyone with the shared link can follow every court and submit a live final score.

The MVP is deliberately runnable without a paid service. It starts with an in-memory backend for local demos and E2E tests, and includes a complete Supabase schema for persistent multi-user use.

## MVP features

- Website-first responsive layout for desktop and mobile browsers
- Badminton singles or doubles, with 1–12 courts
- Session venue, date, start time, duration, and timezone
- Player levels: Beginner, Intermediate, and Pro
- Deterministic balanced lineup generation
- Fair rotation based on games played and rest
- Reduced repeated partners and opponents
- Lineup review, waiting list, and games-played counters
- Host-only lineup replacement and live substitution
- Live court cards shaped like badminton courts
- One-click winner at 21; losing score is adjustable from 0–20
- Score is published only after **Save Score**
- Winner badge on live and completed court cards
- Direct **Start next game** or **Review lineup** flow
- Shared viewer page with Supabase Realtime updates and a 30-second fallback refresh
- Round directory with Next and Completed history
- Leaderboard with rank, games, W–L, points, win rate, and point difference
- Host ownership through an HttpOnly token cookie

## Cost and backend modes

| Mode | Cost | Persistence | Intended use |
| --- | --- | --- | --- |
| `memory` | Free, no account | Until the Next.js server restarts | Local demo, development, E2E |
| Local Supabase | Free, no cloud project | Local Postgres volume | Full local integration |
| Supabase hosted free tier | Free within its published limits | Hosted Postgres | Public MVP |

Nothing in this repository creates a paid cloud resource, enables billing, purchases a domain, or deploys automatically.

## Quick start — no Supabase required

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Keep `DATA_BACKEND=memory`, then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Memory mode is intentionally ephemeral. Restarting the server clears its sessions.

## Local Supabase setup

The Supabase CLI is pinned as a development dependency. Local Supabase additionally requires a Docker-compatible container runtime; none was installed on the machine when this project was generated.

```bash
npm run supabase:start
npm run supabase:reset
npx supabase status -o env
```

Copy the local API URL and service-role key into `.env.local`:

```dotenv
DATA_BACKEND=supabase
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=your-local-secret-or-service-role-key
NEXT_PUBLIC_SUPABASE_REALTIME_ENABLED=true
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-publishable-or-anon-key
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

Then restart `npm run dev`. Never expose `SUPABASE_SECRET_KEY` with a `NEXT_PUBLIC_` prefix. The legacy `SUPABASE_SERVICE_ROLE_KEY` variable remains supported for local CLI output and older projects.

For an optional hosted free-tier project, apply the migration using the Supabase CLI after linking the project, then use that project's server-side URL and service-role key. Review the provider's current free-tier limits before publishing.

## Database and security

The initial migration is in `supabase/migrations/20260801030204_initial_sportround_schema.sql`.

It creates normalized tables for sessions, players, rounds, matches, assignments, and substitution history. It also includes:

- UUID primary keys and indexed foreign keys
- Unique session/player and round/court constraints
- Database enforcement of the fixed-21 final-score rule
- Row Level Security enabled on every public table
- No direct `anon` or `authenticated` table privileges
- Explicit `service_role` access for the server-only data layer
- Safe trigger search paths and revoked public function execution

Browser clients never receive the service-role key. Realtime clients use only the browser-safe publishable key and receive an invalidation event without session data; the latest snapshot still comes through validated Next.js route handlers. The host token is generated with 32 random bytes, stored only as a SHA-256 hash in the database, and returned to the host as an HttpOnly, SameSite cookie.

Anyone holding a share link can view the session and submit a score for a live match, as requested for this MVP. They cannot generate rounds, change lineups, substitute players, or end the session.

## Rotation rules

For every generated round, SportRound:

1. Uses every configured court when enough active players exist.
2. Never assigns one player to two courts in the same round.
3. Prioritizes the lowest games-played count.
4. Prioritizes rested players, avoiding consecutive rounds when the player pool allows it.
5. Balances teams using level weights: Beginner `1`, Intermediate `2`, Pro `3`.
6. Penalizes repeated partnerships and repeated opponents.
7. Uses a session-and-round seed so the same state produces a stable lineup.

Session duration is recorded and displayed, but it does not guess a fixed match duration. The host decides when to move to the next round while the scheduler keeps participation balanced.

## Score and leaderboard rules

- A saved result must have exactly one team at 21.
- The losing score must be an integer from 0 to 20.
- Win: 3 leaderboard points.
- Loss: 0 leaderboard points.
- Ranking order: leaderboard points, point difference, wins, fewer games played, then player name.
- Substituted players remain visible in match history.

This MVP intentionally uses a simplified fixed-21 result and does not yet implement badminton deuce scoring beyond 21.

## Commands

```bash
npm run lint            # ESLint
npm run typecheck       # TypeScript
npm run test            # Vitest unit tests
npm run test:schema     # Apply and verify SQL in embedded PGlite
npm run test:e2e        # Playwright desktop and mobile flows
npm run build           # Production Next.js build
npm run check           # Static checks, unit/schema tests, and build
```

The schema verification checks migration execution, RLS, grants, score constraints, and foreign-key indexes without needing Docker. Playwright uses locally installed Google Chrome and the free memory backend.

## Project structure

```text
src/app/                 Next.js pages and route handlers
src/components/          Responsive product UI
src/lib/domain/          Scheduler, score, snapshot, leaderboard logic
src/lib/server/          Host authorization, services, data-store adapters
src/lib/supabase/        Server client and generated-style database types
supabase/migrations/     PostgreSQL schema and security migration
scripts/                 Embedded SQL verification
tests/unit/              Domain and validation tests
tests/e2e/               Desktop/mobile host and viewer flow
```

## Current MVP boundaries

- Badminton only; the domain types leave room for additional sports later.
- Host access is device/browser-cookie based; account login and host transfer are not included.
- Shared live refresh uses Supabase Realtime Broadcast over WebSocket with focus/online refresh and a 30-second polling fallback.
- The public score endpoint has schema and live-match validation but no distributed rate limiter yet.
- No payment, booking, notification, or tournament-bracket feature is included.
