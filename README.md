# BallGame

You and your friends each get dealt one of the seven clubs that finished top of Serie A in
2025/26. From then on, everything your club does in 2026/27 — Serie A, Champions League,
Europa League, Conference League, Coppa Italia and the Supercoppa Italiana — scores you
points. Whoever's club has the best season wins.

Next.js App Router, deploys to Vercel as-is.

## How the game works

1. A player enters a name and the app deals them a club at random from the top seven.
2. Every club gets a first owner before any club gets a second, so a group of seven or
   fewer all end up with different teams.
3. Results are pulled from the football API and turned into points:

   | Competition        | Win | Draw |
   | ------------------ | --- | ---- |
   | Serie A            | 3   | 1    |
   | Champions League   | 6   | 2    |
   | Europa League      | 4   | 2    |
   | Conference League  | 3   | 1    |
   | Coppa Italia       | 4   | 2    |
   | Supercoppa         | 6   | 3    |

   Plus **+1 per goal scored** and **+2 for a clean sheet**, in any competition.

4. A knockout tie settled on penalties counts as a win for whoever went through, not a
   draw. Postponed and abandoned games are ignored until they are actually played.
5. Ties on points break by goal difference, then wins, then who joined first.

Every number in that table is an environment variable, so you can rebalance it without
touching code.

## Setup

### 1. Get a free football API key

Sign up at [dashboard.api-football.com](https://dashboard.api-football.com) and copy your
key. The free tier is 100 requests a day, which is plenty — this app caches aggressively
and a seven-player game costs roughly 30 calls a day.

API-Football is used because it is the only free tier that covers all six competitions you
asked for. football-data.org has a nicer free tier but no Coppa Italia, no Supercoppa and
no Conference League.

### 2. Deploy

```bash
npx vercel
```

Or push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).

### 3. Add a Redis store (strongly recommended)

In your Vercel project: **Storage → Create Database → Upstash for Redis**, then connect it
to the project. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

Without it the app still runs, but players are held in memory and disappear whenever the
serverless function is recycled. Fine for a local look around, useless for a real game.

### 4. Set the environment variables

In **Settings → Environment Variables**, at minimum:

```
API_FOOTBALL_KEY=your_key_here
```

See [.env.example](.env.example) for everything else that can be tuned.

### 5. Check the draw pool

Open the site. If the header says **Live data** and the seven clubs look right, you are
done. If you see a warning that the 2025/26 table could not be read (some free plans
restrict historical seasons), pin the seven by hand:

```
SERIE_A_TOP7=505:Inter,492:Napoli,499:Atalanta,496:Juventus,489:AC Milan,497:AS Roma,487:Lazio
```

in finishing order, first to seventh. Ids are api-football team ids; `GET /api/leagues` on
your deployment confirms the six competition ids against your plan.

Then send the URL to your friends.

## Running locally

Needs Node 20+ (it is not currently installed on this machine — grab it from
[nodejs.org](https://nodejs.org)).

```bash
npm install
```

```bash
npm run dev
```

Copy `.env.example` to `.env.local` and fill in your key first. Without Redis credentials
it falls back to in-memory storage, which is exactly what you want for local poking.

Want to see a full leaderboard immediately instead of an empty August table? Set
`TRACK_SEASON=2025` and it scores the completed 2025/26 season instead.

## API

| Route                     | What it does                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `GET /api/state`          | Everything the page renders: pool, leaderboard, results, fixtures |
| `POST /api/join`          | `{ "name": "..." }` — deals a club and sets the player cookie   |
| `POST /api/leave`         | Gives up your club and frees your name                          |
| `POST /api/refresh`       | Forces a re-read of results, rate limited to once per 10 min    |
| `GET /api/cron`           | Daily warm-up, wired in `vercel.json`                           |
| `GET /api/leagues`        | Setup helper: checks the six league ids against your plan       |

Players are identified by an opaque token in an httpOnly cookie — no passwords, no
accounts. Clearing cookies means losing the club, which is why `/api/leave` exists.

## Quota notes

- Standings are fetched once a day; each club's fixtures once every six hours.
- Cached data is served stale rather than refetched if the provider errors, so a rate
  limit degrades into slightly old numbers instead of a broken page.
- The manual refresh button is locked behind a 10 minute cooldown for the same reason.
- A daily Vercel cron warms the cache so the first visitor of the day is not the one
  waiting on seven API calls.
