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

### 1. Deploy

```bash
npx vercel
```

Or push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new). The
framework preset is **Next.js** and it is detected automatically.

### 2. Add a Redis store

In your Vercel project: **Storage → Create Database → Upstash for Redis**, then connect it
to the project. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

Without it the app still runs, but players are held in memory and disappear whenever the
serverless function is recycled. Fine for a local look around, useless for a real game.

### 3. That's it

There is no API key to configure. See [.env.example](.env.example) for the optional knobs.

## Where the data comes from

ESPN's public soccer API — no account, no key, no rate limit — via two endpoints:

- `…/soccer/ita.1/standings?season=2025` for the 2025/26 final table the draw uses.
- `…/soccer/{slug}/scoreboard?dates=20260701-20270629&limit=1000` for results, once per
  competition. One request returns an entire season, so a refresh costs six calls total no
  matter how many clubs are being tracked.

This was chosen because it is the only free source covering all six of these competitions
for the current season. API-Football's free tier stops at 2024; football-data.org's free
tier has no Coppa Italia, Supercoppa or Conference League.

**The trade-off:** this endpoint is undocumented and carries no stability guarantee. Every
response is parsed defensively, cached, and served stale rather than erroring if a call
fails, so a hiccup shows slightly old numbers instead of a broken page. If ESPN ever
changes it, `GET /api/leagues` will show you which of the six slugs stopped resolving, and
`SERIE_A_TOP7` lets you pin the draw pool by hand in the meantime.

Caching: standings once a day, scoreboards every three hours, with a stale-while-revalidate
layer and a single-flight lock so a burst of visitors is not a burst of upstream requests.
A daily Vercel cron warms it all.

## Running locally

Needs Node 20+ (it is not currently installed on this machine — grab it from
[nodejs.org](https://nodejs.org)).

```bash
npm install
```

```bash
npm run dev
```

No `.env.local` is required. Without Redis credentials it falls back to in-memory storage,
which is what you want for local poking.

Want to see a full leaderboard immediately instead of a table that has barely kicked off?
Set `TRACK_SEASON=2025` and it scores the completed 2025/26 season instead.

## API

| Route                     | What it does                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `GET /api/state`          | Everything the page renders: pool, leaderboard, results, fixtures |
| `POST /api/join`          | `{ "name": "..." }` — deals a club and sets the player cookie   |
| `POST /api/leave`         | Gives up your club and frees your name                          |
| `POST /api/refresh`       | Forces a re-read of results, rate limited to once a minute      |
| `GET /api/cron`           | Daily warm-up, wired in `vercel.json`                           |
| `GET /api/leagues`        | Health check: confirms all six ESPN slugs still resolve         |

Players are identified by an opaque token in an httpOnly cookie — no passwords, no
accounts. Clearing cookies means losing the club, which is why `/api/leave` exists.
