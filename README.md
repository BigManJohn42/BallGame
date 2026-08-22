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

   Every competition pays **3 for a win and 1 for a draw**, plus **+1 per goal scored**
   and **+2 for a clean sheet**.

   Scoring is flat across competitions on purpose. A club does not choose which cups it
   ends up in, so paying more for one than another would just be a second reward for
   finishing high last season — which the draw already reflects.

4. A knockout tie settled on penalties counts as a win for whoever went through, not a
   draw. Postponed and abandoned games are ignored until they are actually played.
5. Ties on points break by goal difference, then wins, then who joined first.

### Bonus points

On top of match results, clubs earn one-off bonuses.

**Statistical awards — 5 points each.** Top scorer, top assister, most goals + assists,
most saves, most clean sheets. These are contested **between the clubs in this game**, not
against all of Europe — the Champions League top scorer is rarely a Serie A player, so a
global comparison would leave every award unclaimed. Goals and assists are summed across
all six competitions. If two clubs tie, both are paid; if two players at the same club tie,
the club is paid once.

**Cup progress.** Only the furthest round reached is paid, not every round along the way:

| Reached | Points |
| ------- | ------ |
| Knockout playoff | 1 |
| Round of 32 | 2 |
| Round of 16 | 3 |
| Quarter-final | 5 |
| Semi-final | 7 |
| Final | 8 |
| **Won the trophy** | **10** |

In Europe, the top eight of the league phase go straight to the last 16 while ninth to
twenty-fourth have to win a playoff to get there. Both end up in the same round, so
qualifying directly is worth **+3** on its own.

**Serie A finish.** Champions 12, top four 8, 5th–6th 5, 7th 3. Only the highest applies.

Bonuses that are still contestable show faded on the leaderboard and can be lost again
before the season ends. Every number above is an environment variable, so you can rebalance
the whole game without touching code — see [.env.example](.env.example).

## What's on the page

Anything being played right now sits above the tabs, with a running score and clock —
it's the most interesting thing on the page whatever you're reading. Then six tabs, each
deep-linkable by URL hash:

| Tab | What's in it |
| --- | --- |
| **Leaderboard** | Players, clubs, points split into match and bonus, movement arrows since the last gameweek, and where each club's points came from |
| **Serie A** | The real league table, colour-coded by qualification and relegation band, with the clubs in play highlighted |
| **Players** | Top scorers, assists, goals + assists and saves — among the clubs in this game |
| **Fixtures** | Recent results with the points they earned, and what's coming up |
| **This week** | Who gained, who climbed, result of the week, and a summary you can paste into the group chat |
| **Rules** | Every scoring value, including the bonuses |

**Any club's full season.** Click a club anywhere and you get every result and every
remaining fixture across all six competitions, filterable by competition, with the points
each result earned. It is public: anyone can inspect anyone else's club, no login.

On phones the leaderboard becomes cards rather than a ten-column table.

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
| `GET /api/club/{teamId}`  | One club's whole season — every result and fixture. Public       |
| `GET /api/players`       | Individual stat leaders among the clubs in the game             |
| `GET /api/leagues`        | Health check: confirms all six ESPN slugs still resolve         |

Players are identified by an opaque token in an httpOnly cookie — no passwords, no
accounts. Clearing cookies means losing the club, which is why `/api/leave` exists.
