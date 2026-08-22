import { COMPETITIONS, SERIE_A, type Competition } from "./competitions";
import { matchPoints, outcomeFor } from "./scoring";
import { getStore } from "./store";
import type { DataSource, PlayedMatch, Team, TeamScore, UpcomingMatch } from "./types";

/**
 * Data comes from ESPN's public soccer API: no key, no quota, and it covers all
 * six competitions for current seasons. It is undocumented, so every response is
 * parsed defensively and cached, and a failure falls back to stale data rather
 * than an error page.
 */

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_CORE = "https://site.api.espn.com/apis/v2/sports/soccer";

/* ------------------------------------------------------------------ config */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Season the draw is made from: 2025 === the 2025/26 campaign. */
export const DRAW_SEASON = envInt("DRAW_SEASON", 2025);
/** Season whose results feed the leaderboard. */
export const TRACK_SEASON = envInt("TRACK_SEASON", 2026);
export const TOP_N = envInt("TOP_N", 7);

const STANDINGS_TTL = envInt("STANDINGS_TTL", 60 * 60 * 24); // 1 day
const FIXTURES_TTL = envInt("FIXTURES_TTL", 60 * 60 * 3); // 3 hours
const HARD_TTL = envInt("CACHE_HARD_TTL", 60 * 60 * 24 * 14); // keep stale data 2 weeks

export function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
}

/**
 * A season runs July to June. ESPN rejects a `dates` range longer than a year,
 * so this stops just short of one.
 */
function seasonWindow(season: number): string {
  return `${season}0701-${season + 1}0629`;
}

function logoFor(teamId: number): string {
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
}

/* ------------------------------------------------------------ http client */

class ProviderError extends Error {}

async function espn(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new ProviderError(`ESPN returned HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/* -------------------------------------------------- stale-while-revalidate */

type CacheEntry<T> = { data: T; at: number };

async function swr<T>(
  key: string,
  softTtlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; at: number; error: string | null }> {
  const store = getStore();
  const entry = await store.cacheGet<CacheEntry<T>>(key);
  if (entry && Date.now() - entry.at < softTtlSeconds * 1000) {
    return { data: entry.data, at: entry.at, error: null };
  }

  // One refresh at a time, so a burst of visitors does not become a burst of
  // upstream requests.
  const mayFetch = entry ? await store.acquireLock(key, 60) : true;
  if (!mayFetch && entry) return { data: entry.data, at: entry.at, error: null };

  try {
    const data = await fetcher();
    const at = Date.now();
    await store.cacheSet<CacheEntry<T>>(key, { data, at }, HARD_TTL);
    return { data, at, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (entry) return { data: entry.data, at: entry.at, error: message };
    throw err;
  }
}

/* ------------------------------------------------------------------- teams */

/**
 * The real 2025/26 Serie A top seven, read from ESPN's final table. Used only
 * if the standings call itself fails, so the draw never stops working.
 */
const KNOWN_TOP7: Team[] = [
  { id: 110, name: "Internazionale", rank: 1, logo: logoFor(110) },
  { id: 114, name: "Napoli", rank: 2, logo: logoFor(114) },
  { id: 104, name: "AS Roma", rank: 3, logo: logoFor(104) },
  { id: 2572, name: "Como", rank: 4, logo: logoFor(2572) },
  { id: 103, name: "AC Milan", rank: 5, logo: logoFor(103) },
  { id: 111, name: "Juventus", rank: 6, logo: logoFor(111) },
  { id: 105, name: "Atalanta", rank: 7, logo: logoFor(105) },
];

type StandingsEntry = {
  team?: {
    id?: string;
    displayName?: string;
    shortDisplayName?: string;
    logos?: { href?: string }[];
  };
  stats?: { name?: string; value?: number }[];
};

function readStandings(payload: unknown): Team[] {
  const root = payload as {
    children?: { standings?: { entries?: StandingsEntry[] } }[];
    standings?: { entries?: StandingsEntry[] };
  };
  const entries =
    root?.children?.[0]?.standings?.entries ?? root?.standings?.entries ?? [];

  const teams: Team[] = [];
  for (const entry of entries) {
    const id = Number(entry?.team?.id);
    if (!Number.isFinite(id)) continue;
    const rank = entry?.stats?.find((s) => s.name === "rank")?.value;
    teams.push({
      id,
      name: entry.team?.displayName ?? entry.team?.shortDisplayName ?? `Team ${id}`,
      logo: entry.team?.logos?.[0]?.href ?? logoFor(id),
      rank: typeof rank === "number" ? rank : teams.length + 1,
    });
  }
  // ESPN normally returns these in order, but do not rely on it.
  return teams.sort((a, b) => a.rank - b.rank);
}

function parseOverride(): Team[] | null {
  const raw = process.env.SERIE_A_TOP7;
  if (!raw || !raw.trim()) return null;

  const teams: Team[] = [];
  for (const part of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const [idPart, ...nameParts] = part.split(":");
    const id = Number.parseInt(idPart.trim(), 10);
    if (!Number.isFinite(id)) continue;
    teams.push({
      id,
      name: nameParts.join(":").trim() || `Team ${id}`,
      logo: logoFor(id),
      rank: teams.length + 1,
    });
  }
  return teams.length ? teams : null;
}

export async function getDrawPool(): Promise<{
  teams: Team[];
  source: DataSource;
  notices: string[];
}> {
  const override = parseOverride();
  if (override) {
    return {
      teams: override.slice(0, TOP_N),
      source: "override",
      notices: ["Draw pool pinned by the SERIE_A_TOP7 environment variable."],
    };
  }

  const notices: string[] = [];
  try {
    const { data, error } = await swr(
      `standings:${SERIE_A.slug}:${DRAW_SEASON}`,
      STANDINGS_TTL,
      async () =>
        readStandings(
          await espn(`${ESPN_CORE}/${SERIE_A.slug}/standings?season=${DRAW_SEASON}`),
        ),
    );
    if (error) notices.push(`Standings served from cache: ${error}`);
    if (data.length >= TOP_N) {
      return { teams: data.slice(0, TOP_N), source: "live", notices };
    }
    notices.push(
      `The ${seasonLabel(DRAW_SEASON)} Serie A table came back short (${
        data.length
      } clubs). Using the known final table instead.`,
    );
  } catch (err) {
    notices.push(
      `Could not load the ${seasonLabel(DRAW_SEASON)} Serie A table: ${
        err instanceof Error ? err.message : String(err)
      }. Using the known final table instead.`,
    );
  }

  return { teams: KNOWN_TOP7.slice(0, TOP_N), source: "placeholder", notices };
}

/* ----------------------------------------------------------------- results */

/** Trimmed to what scoring needs, because the raw feed is far too big to cache. */
type CachedSide = {
  id: number;
  name: string;
  logo: string;
  score: number | null;
  pens: number | null;
};

type CachedMatch = {
  id: string;
  date: string;
  round: string;
  done: boolean;
  upcoming: boolean;
  home: CachedSide;
  away: CachedSide;
};

type RawCompetitor = {
  homeAway?: string;
  score?: string | number;
  shootoutScore?: number;
  team?: { id?: string; displayName?: string; shortDisplayName?: string; logo?: string };
};

type RawEvent = {
  id?: string;
  date?: string;
  season?: { slug?: string };
  status?: { type?: { state?: string; completed?: boolean } };
  competitions?: { competitors?: RawCompetitor[] }[];
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readSide(competitor: RawCompetitor | undefined): CachedSide | null {
  const id = Number(competitor?.team?.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name:
      competitor?.team?.displayName ?? competitor?.team?.shortDisplayName ?? `Team ${id}`,
    logo: competitor?.team?.logo ?? logoFor(id),
    score: toNumberOrNull(competitor?.score),
    pens: toNumberOrNull(competitor?.shootoutScore),
  };
}

function readScoreboard(payload: unknown): CachedMatch[] {
  const events = (payload as { events?: RawEvent[] })?.events ?? [];
  const matches: CachedMatch[] = [];

  for (const event of events) {
    const competitors = event?.competitions?.[0]?.competitors ?? [];
    const home = readSide(competitors.find((c) => c.homeAway === "home"));
    const away = readSide(competitors.find((c) => c.homeAway === "away"));
    if (!home || !away || !event.date) continue;

    const type = event.status?.type;
    matches.push({
      id: String(event.id ?? `${event.date}-${home.id}-${away.id}`),
      date: event.date,
      round: event.season?.slug ?? "",
      done: type?.completed === true,
      // Anything neither finished nor scheduled (postponed, abandoned, live) is
      // left out of both lists until it resolves.
      upcoming: type?.state === "pre",
      home,
      away,
    });
  }
  return matches;
}

async function competitionMatches(
  competition: Competition,
): Promise<{ data: CachedMatch[]; at: number; error: string | null }> {
  const window = seasonWindow(TRACK_SEASON);
  return swr(`espn:${competition.slug}:${window}`, FIXTURES_TTL, async () =>
    readScoreboard(
      await espn(
        `${ESPN_SITE}/${competition.slug}/scoreboard?dates=${window}&limit=1000`,
      ),
    ),
  );
}

function emptyScore(teamId: number): TeamScore {
  return {
    teamId,
    points: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cleanSheets: 0,
    byCompetition: {},
    form: [],
  };
}

export type ResultsBundle = {
  scores: Record<number, TeamScore>;
  played: PlayedMatch[];
  upcoming: UpcomingMatch[];
  source: DataSource;
  lastUpdated: number;
  notices: string[];
};

/**
 * One request per competition covers the whole season for every club in it, so
 * the cost is six calls regardless of how many teams are being tracked.
 */
export async function getResults(teams: Team[]): Promise<ResultsBundle> {
  const scores: Record<number, TeamScore> = {};
  const wanted = new Set<number>();
  for (const team of teams) {
    scores[team.id] = emptyScore(team.id);
    wanted.add(team.id);
  }

  const played: PlayedMatch[] = [];
  const upcoming: UpcomingMatch[] = [];
  const notices: string[] = [];

  const fetched = await Promise.all(
    COMPETITIONS.map(async (competition) => {
      try {
        const result = await competitionMatches(competition);
        return { competition, ...result, ok: true as const };
      } catch (err) {
        return {
          competition,
          data: [] as CachedMatch[],
          at: 0,
          error: err instanceof Error ? err.message : String(err),
          ok: false as const,
        };
      }
    }),
  );

  let anyLive = false;
  let oldest = Number.POSITIVE_INFINITY;

  for (const result of fetched) {
    if (!result.ok) {
      notices.push(`Could not load ${result.competition.name}: ${result.error}`);
      continue;
    }
    anyLive = true;
    oldest = Math.min(oldest, result.at);
    if (result.error) {
      notices.push(`${result.competition.name}: serving cached fixtures (${result.error})`);
    }

    for (const match of result.data) {
      for (const [side, other] of [
        [match.home, match.away],
        [match.away, match.home],
      ] as const) {
        if (!wanted.has(side.id)) continue;
        const home = side.id === match.home.id;

        if (match.done && side.score !== null && other.score !== null) {
          const { outcome, viaPenalties } = outcomeFor({
            teamId: side.id,
            homeId: match.home.id,
            goalsHome: match.home.score ?? 0,
            goalsAway: match.away.score ?? 0,
            penaltyHome: match.home.pens,
            penaltyAway: match.away.pens,
          });
          played.push({
            fixtureId: Number(match.id) || 0,
            teamId: side.id,
            competitionId: result.competition.id,
            competitionName: result.competition.name,
            round: match.round,
            date: match.date,
            opponent: other.name,
            opponentLogo: other.logo,
            home,
            goalsFor: side.score,
            goalsAgainst: other.score,
            outcome,
            viaPenalties,
            points: matchPoints({
              competitionId: result.competition.id,
              outcome,
              goalsFor: side.score,
              goalsAgainst: other.score,
            }),
          });
        } else if (match.upcoming) {
          upcoming.push({
            fixtureId: Number(match.id) || 0,
            teamId: side.id,
            competitionId: result.competition.id,
            competitionName: result.competition.name,
            round: match.round,
            date: match.date,
            opponent: other.name,
            opponentLogo: other.logo,
            home,
          });
        }
      }
    }
  }

  played.sort((a, b) => a.date.localeCompare(b.date));
  for (const match of played) {
    const score = scores[match.teamId];
    if (!score) continue;
    score.points += match.points;
    score.played += 1;
    score.goalsFor += match.goalsFor;
    score.goalsAgainst += match.goalsAgainst;
    if (match.goalsAgainst === 0) score.cleanSheets += 1;
    if (match.outcome === "W") score.wins += 1;
    else if (match.outcome === "D") score.draws += 1;
    else score.losses += 1;
    const key = competitionKey(match.competitionId);
    score.byCompetition[key] = (score.byCompetition[key] ?? 0) + match.points;
    score.form.push(match.outcome);
  }
  for (const id of Object.keys(scores)) {
    const score = scores[Number(id)];
    score.form = score.form.slice(-5);
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return {
    scores,
    played: played.reverse(),
    upcoming,
    source: anyLive ? "live" : "placeholder",
    lastUpdated: Number.isFinite(oldest) ? oldest : Date.now(),
    notices,
  };
}

function competitionKey(competitionId: number): string {
  return COMPETITIONS.find((c) => c.id === competitionId)?.key ?? String(competitionId);
}

/** Drops the cached scoreboards so the next read refetches from ESPN. */
export async function invalidateResults(): Promise<void> {
  const store = getStore();
  const window = seasonWindow(TRACK_SEASON);
  await Promise.all(
    COMPETITIONS.map((c) => store.cacheDrop(`espn:${c.slug}:${window}`)),
  );
}

/** Setup helper behind /api/leagues: checks all six slugs actually resolve. */
export async function checkCompetitions(): Promise<unknown> {
  const window = seasonWindow(TRACK_SEASON);
  return Promise.all(
    COMPETITIONS.map(async (c) => {
      try {
        const payload = (await espn(
          `${ESPN_SITE}/${c.slug}/scoreboard?dates=${window}&limit=1000`,
        )) as { leagues?: { name?: string }[]; events?: unknown[] };
        return {
          name: c.name,
          slug: c.slug,
          ok: true,
          providerName: payload?.leagues?.[0]?.name ?? null,
          fixtures: payload?.events?.length ?? 0,
        };
      } catch (err) {
        return {
          name: c.name,
          slug: c.slug,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}
