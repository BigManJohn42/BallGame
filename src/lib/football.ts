import { COMPETITIONS, SERIE_A_ID, competitionById, isTracked } from "./competitions";
import { matchPoints, outcomeFor } from "./scoring";
import { getStore } from "./store";
import type { DataSource, PlayedMatch, Team, TeamScore, UpcomingMatch } from "./types";

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
const FIXTURES_TTL = envInt("FIXTURES_TTL", 60 * 60 * 6); // 6 hours
const HARD_TTL = envInt("CACHE_HARD_TTL", 60 * 60 * 24 * 14); // keep stale data 2 weeks

export function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

/* ------------------------------------------------------------ http client */

class ProviderError extends Error {}

type ApiPayload<T> = { response?: T[]; errors?: unknown; results?: number };

function providerErrors(payload: { errors?: unknown }): string[] {
  const e = payload.errors;
  if (!e) return [];
  if (Array.isArray(e)) return e.map((x) => String(x));
  if (typeof e === "object") {
    return Object.entries(e as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`);
  }
  return [String(e)];
}

async function apiFootball<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new ProviderError("API_FOOTBALL_KEY is not set");

  // Direct api-sports.io by default. Set API_FOOTBALL_HOST to the RapidAPI host
  // instead if the key was issued through RapidAPI.
  const host = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
  const viaRapidApi = host.includes("rapidapi.com");
  const base = viaRapidApi ? `https://${host}/v3` : `https://${host}`;

  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const headers: Record<string, string> = viaRapidApi
    ? { "x-rapidapi-key": key, "x-rapidapi-host": host }
    : { "x-apisports-key": key };

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new ProviderError(`${path} returned HTTP ${res.status} ${res.statusText}`);
  }

  const payload = (await res.json()) as ApiPayload<T>;
  const errors = providerErrors(payload);
  if (errors.length) throw new ProviderError(errors.join("; "));
  return payload.response ?? [];
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

  // One refresh at a time: the free plan has a daily request budget to protect.
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

/* ------------------------------------------------------------- team lookup */

type RawTeamEntry = { team: { id: number; name: string; logo: string } };

/** id to name/logo for every Serie A club: one request, cached for a month. */
async function serieATeamDirectory(): Promise<Map<number, { name: string; logo: string }>> {
  const { data } = await swr(
    `teams:${SERIE_A_ID}:${DRAW_SEASON}`,
    60 * 60 * 24 * 30,
    async () => {
      const rows = await apiFootball<RawTeamEntry>("/teams", {
        league: SERIE_A_ID,
        season: DRAW_SEASON,
      });
      return rows.map((r) => r.team);
    },
  );
  return new Map(data.map((t) => [t.id, { name: t.name, logo: t.logo }] as const));
}

function logoFor(id: number): string {
  return `https://media.api-sports.io/football/teams/${id}.png`;
}

/* ------------------------------------------------------------------- teams */

/**
 * Used only when neither an API key nor an override is configured, so the app
 * is still clickable out of the box. These are NOT the real 2025/26 final
 * positions, and the UI says as much.
 */
const PLACEHOLDER_TOP7: Team[] = [
  { id: 505, name: "Inter", rank: 1, logo: logoFor(505) },
  { id: 492, name: "Napoli", rank: 2, logo: logoFor(492) },
  { id: 499, name: "Atalanta", rank: 3, logo: logoFor(499) },
  { id: 496, name: "Juventus", rank: 4, logo: logoFor(496) },
  { id: 489, name: "AC Milan", rank: 5, logo: logoFor(489) },
  { id: 497, name: "AS Roma", rank: 6, logo: logoFor(497) },
  { id: 487, name: "Lazio", rank: 7, logo: logoFor(487) },
];

type RawStandingRow = {
  rank: number;
  team: { id: number; name: string; logo: string };
};
type RawStandings = { league: { standings: RawStandingRow[][] } };

async function parseOverride(): Promise<Team[] | null> {
  const raw = process.env.SERIE_A_TOP7;
  if (!raw || !raw.trim()) return null;

  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  let directory: Map<number, { name: string; logo: string }> | null = null;
  const teams: Team[] = [];

  for (const [i, part] of parts.entries()) {
    const [idPart, ...nameParts] = part.split(":");
    const id = Number.parseInt(idPart.trim(), 10);
    if (!Number.isFinite(id)) continue;

    let name = nameParts.join(":").trim();
    let logo = logoFor(id);
    if (!name) {
      if (!directory && hasApiKey()) {
        directory = await serieATeamDirectory().catch(() => null);
      }
      const hit = directory ? directory.get(id) : undefined;
      name = hit?.name ?? `Team ${id}`;
      if (hit?.logo) logo = hit.logo;
    }
    teams.push({ id, name, logo, rank: i + 1 });
  }

  return teams.length ? teams : null;
}

export async function getDrawPool(): Promise<{
  teams: Team[];
  source: DataSource;
  notices: string[];
}> {
  const notices: string[] = [];

  const override = await parseOverride();
  if (override) {
    return {
      teams: override.slice(0, TOP_N),
      source: "override",
      notices: ["Draw pool pinned by the SERIE_A_TOP7 environment variable."],
    };
  }

  if (!hasApiKey()) {
    notices.push(
      `No API_FOOTBALL_KEY set, so these are placeholder clubs rather than the real ${seasonLabel(
        DRAW_SEASON,
      )} top ${TOP_N}. Add a free key (or set SERIE_A_TOP7) and the real table loads.`,
    );
    return { teams: PLACEHOLDER_TOP7.slice(0, TOP_N), source: "placeholder", notices };
  }

  try {
    const { data, error } = await swr(
      `standings:${SERIE_A_ID}:${DRAW_SEASON}`,
      STANDINGS_TTL,
      async () => {
        const rows = await apiFootball<RawStandings>("/standings", {
          league: SERIE_A_ID,
          season: DRAW_SEASON,
        });
        const table = rows[0]?.league?.standings?.[0] ?? [];
        return table.map((row) => ({
          id: row.team.id,
          name: row.team.name,
          logo: row.team.logo,
          rank: row.rank,
        }));
      },
    );
    if (error) notices.push(`Standings served from cache: ${error}`);
    if (data.length) {
      return { teams: data.slice(0, TOP_N), source: "live", notices };
    }
    notices.push(
      `The provider returned no ${seasonLabel(
        DRAW_SEASON,
      )} Serie A table (a free plan may not cover that season). Showing placeholders. Set SERIE_A_TOP7 to pin the real seven.`,
    );
  } catch (err) {
    notices.push(
      `Could not load the ${seasonLabel(DRAW_SEASON)} Serie A table: ${
        err instanceof Error ? err.message : String(err)
      }. Showing placeholders. Set SERIE_A_TOP7 to pin the real seven.`,
    );
  }

  return { teams: PLACEHOLDER_TOP7.slice(0, TOP_N), source: "placeholder", notices };
}

/* ----------------------------------------------------------------- results */

type RawFixture = {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; name: string; season: number; round: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
  score?: { penalty?: { home: number | null; away: number | null } };
};

const FINISHED = new Set(["FT", "AET", "PEN"]);
const VOID = new Set(["PST", "CANC", "ABD", "AWD", "WO", "SUSP", "INT", "TBD"]);

function toPlayed(fx: RawFixture, teamId: number): PlayedMatch | null {
  const goalsHome = fx.goals.home;
  const goalsAway = fx.goals.away;
  if (goalsHome === null || goalsAway === null) return null;

  const home = fx.teams.home.id === teamId;
  const other = home ? fx.teams.away : fx.teams.home;
  const { outcome, viaPenalties } = outcomeFor({
    teamId,
    homeId: fx.teams.home.id,
    goalsHome,
    goalsAway,
    penaltyHome: fx.score?.penalty?.home ?? null,
    penaltyAway: fx.score?.penalty?.away ?? null,
  });

  const goalsFor = home ? goalsHome : goalsAway;
  const goalsAgainst = home ? goalsAway : goalsHome;

  return {
    fixtureId: fx.fixture.id,
    teamId,
    competitionId: fx.league.id,
    competitionName: competitionById(fx.league.id)?.name ?? fx.league.name,
    round: fx.league.round,
    date: fx.fixture.date,
    opponent: other.name,
    opponentLogo: other.logo,
    home,
    goalsFor,
    goalsAgainst,
    outcome,
    viaPenalties,
    points: matchPoints({ competitionId: fx.league.id, outcome, goalsFor, goalsAgainst }),
  };
}

function toUpcoming(fx: RawFixture, teamId: number): UpcomingMatch {
  const home = fx.teams.home.id === teamId;
  const other = home ? fx.teams.away : fx.teams.home;
  return {
    fixtureId: fx.fixture.id,
    teamId,
    competitionId: fx.league.id,
    competitionName: competitionById(fx.league.id)?.name ?? fx.league.name,
    round: fx.league.round,
    date: fx.fixture.date,
    opponent: other.name,
    opponentLogo: other.logo,
    home,
  };
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
 * One request per team returns that club's whole season across every
 * competition it plays in; we then keep only the six we track.
 */
export async function getResults(teams: Team[]): Promise<ResultsBundle> {
  const scores: Record<number, TeamScore> = {};
  for (const team of teams) scores[team.id] = emptyScore(team.id);

  const played: PlayedMatch[] = [];
  const upcoming: UpcomingMatch[] = [];
  const notices: string[] = [];

  if (!hasApiKey()) {
    notices.push(
      "Results tracking is idle until API_FOOTBALL_KEY is set, so every team sits on zero.",
    );
    return {
      scores,
      played,
      upcoming,
      source: "placeholder",
      lastUpdated: Date.now(),
      notices,
    };
  }

  const seen = new Set<number>();
  const unique = teams.filter((team) => {
    if (seen.has(team.id)) return false;
    seen.add(team.id);
    return true;
  });

  // In parallel: seven clubs is well inside the provider's per-minute ceiling,
  // and doing them one at a time risks the serverless timeout on a cold cache.
  const fetched = await Promise.all(
    unique.map(async (team) => {
      try {
        const { data, at, error } = await swr(
          `fixtures:${team.id}:${TRACK_SEASON}`,
          FIXTURES_TTL,
          () => apiFootball<RawFixture>("/fixtures", { team: team.id, season: TRACK_SEASON }),
        );
        return { team, data, at, error, ok: true as const };
      } catch (err) {
        return {
          team,
          data: [] as RawFixture[],
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
      notices.push(`Could not load fixtures for ${result.team.name}: ${result.error}`);
      continue;
    }
    anyLive = true;
    oldest = Math.min(oldest, result.at);
    if (result.error) {
      notices.push(`${result.team.name}: serving cached fixtures (${result.error})`);
    }

    for (const fx of result.data) {
      if (!isTracked(fx.league.id)) continue;
      const status = fx.fixture.status.short;
      if (VOID.has(status)) continue;

      if (FINISHED.has(status)) {
        const match = toPlayed(fx, result.team.id);
        if (match) played.push(match);
      } else {
        upcoming.push(toUpcoming(fx, result.team.id));
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
    const key = competitionById(match.competitionId)?.key ?? String(match.competitionId);
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

/** Drops the cached fixture pages so the next read refetches from the provider. */
export async function invalidateResults(teams: Team[]): Promise<void> {
  const store = getStore();
  await Promise.all(teams.map((t) => store.cacheDrop(`fixtures:${t.id}:${TRACK_SEASON}`)));
}

/** Debug helper behind /api/leagues: confirms the six league ids on your plan. */
export async function lookupLeagues(search?: string): Promise<unknown> {
  if (search) return apiFootball<unknown>("/leagues", { search });

  const found: unknown[] = [];
  for (const comp of COMPETITIONS) {
    try {
      const rows = await apiFootball<{
        league: { id: number; name: string };
        country: { name: string };
      }>("/leagues", { id: comp.id });
      const hit = rows[0];
      found.push({
        configured: comp.name,
        id: comp.id,
        providerName: hit?.league?.name ?? null,
        country: hit?.country?.name ?? null,
        ok: Boolean(hit),
      });
    } catch (err) {
      found.push({
        configured: comp.name,
        id: comp.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return found;
}
