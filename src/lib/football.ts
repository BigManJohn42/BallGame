import { COMPETITIONS, SERIE_A, type Competition } from "./competitions";
import { matchPoints, outcomeFor } from "./scoring";
import { getStore } from "./store";
import type {
  DataSource,
  HeadToHead,
  HeadToHeadMeeting,
  LeagueRow,
  LiveMatch,
  PlayerBoard,
  PlayedMatch,
  Team,
  TeamScore,
  UpcomingMatch,
} from "./types";

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
  note?: { description?: string; color?: string };
  stats?: { name?: string; value?: number }[];
};

/**
 * ESPN names soccer stats after American sports: `pointsFor` is goals scored,
 * `ties` is draws, and `points` is the league points total.
 */
function readTable(payload: unknown): LeagueRow[] {
  const root = payload as {
    children?: { standings?: { entries?: StandingsEntry[] } }[];
    standings?: { entries?: StandingsEntry[] };
  };
  const entries =
    root?.children?.[0]?.standings?.entries ?? root?.standings?.entries ?? [];

  const rows: LeagueRow[] = [];
  for (const entry of entries) {
    const id = Number(entry?.team?.id);
    if (!Number.isFinite(id)) continue;
    const stat = (name: string): number => {
      const v = entry.stats?.find((s) => s.name === name)?.value;
      return typeof v === "number" ? v : 0;
    };
    const rank = entry.stats?.find((s) => s.name === "rank")?.value;
    rows.push({
      rank: typeof rank === "number" ? rank : rows.length + 1,
      teamId: id,
      name: entry.team?.displayName ?? entry.team?.shortDisplayName ?? `Team ${id}`,
      logo: entry.team?.logos?.[0]?.href ?? logoFor(id),
      played: stat("gamesPlayed"),
      wins: stat("wins"),
      draws: stat("ties"),
      losses: stat("losses"),
      goalsFor: stat("pointsFor"),
      goalsAgainst: stat("pointsAgainst"),
      goalDifference: stat("pointDifferential"),
      points: stat("points"),
      zone: entry.note?.description ?? null,
      zoneColor: entry.note?.color ?? null,
    });
  }
  // ESPN normally returns these in order, but do not rely on it.
  return rows.sort((a, b) => a.rank - b.rank);
}

function rowsToTeams(rows: LeagueRow[]): Team[] {
  return rows.map((r) => ({ id: r.teamId, name: r.name, logo: r.logo, rank: r.rank }));
}

const TABLE_TTL = envInt("TABLE_TTL", 60 * 60 * 3);

/**
 * The full Serie A table. The completed draw season never changes so it is held
 * for a day; the live one refreshes every few hours to follow each gameweek.
 */
export async function getFullTable(season: number): Promise<{
  rows: LeagueRow[];
  at: number;
  error: string | null;
}> {
  const { data, at, error } = await swr(
    `table:${SERIE_A.slug}:${season}`,
    season === DRAW_SEASON ? STANDINGS_TTL : TABLE_TTL,
    async () =>
      readTable(await espn(`${ESPN_CORE}/${SERIE_A.slug}/standings?season=${season}`)),
  );
  return { rows: data, at, error };
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
    const { rows, error } = await getFullTable(DRAW_SEASON);
    const data = rowsToTeams(rows);
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
  status?: {
    displayClock?: string;
    type?: { state?: string; completed?: boolean; description?: string };
  };
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
    matchPoints: 0,
    bonusPoints: 0,
    awards: [],
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
  live: LiveMatch[];
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
  // Kickoff times for every tracked club's matches, whatever their status.
  const kickoffTimes: number[] = [];

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

        const kickoff = Date.parse(match.date);
        if (Number.isFinite(kickoff)) kickoffTimes.push(kickoff);

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
    score.matchPoints += match.points;
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

  // Only reach for live scores when a tracked club could plausibly be on the
  // pitch: kicking off within the next 15 minutes, or started up to 4 hours ago.
  //
  // This deliberately looks at every cached match, not just the upcoming ones.
  // If the season feed happened to be refreshed mid-match the fixture is neither
  // finished nor scheduled, so keying off `upcoming` alone would go blind during
  // exactly the game we want to show.
  const now = Date.now();
  const maybeLive = kickoffTimes.some(
    (kickoff) => kickoff <= now + 15 * 60_000 && kickoff > now - 4 * 60 * 60_000,
  );
  const live = maybeLive ? await getLiveMatches(teams).catch(() => []) : [];

  return {
    scores,
    played: played.reverse(),
    upcoming,
    live,
    source: anyLive ? "live" : "placeholder",
    lastUpdated: Number.isFinite(oldest) ? oldest : Date.now(),
    notices,
  };
}

function competitionKey(competitionId: number): string {
  return COMPETITIONS.find((c) => c.id === competitionId)?.key ?? String(competitionId);
}

/* ------------------------------------------------------------------- live */

const LIVE_TTL = envInt("LIVE_TTL", 45);

type LiveSide = { id: number; name: string; logo: string; score: number };

type CachedLive = {
  id: string;
  competitionId: number;
  clock: string;
  phase: string;
  home: LiveSide;
  away: LiveSide;
};

function readLive(payload: unknown, competition: Competition): CachedLive[] {
  const events = (payload as { events?: RawEvent[] })?.events ?? [];
  const out: CachedLive[] = [];

  for (const event of events) {
    const type = event.status?.type;
    if (type?.state !== "in") continue;

    const competitors = event.competitions?.[0]?.competitors ?? [];
    const read = (side: "home" | "away"): LiveSide | null => {
      const c = competitors.find((x) => x.homeAway === side);
      const id = Number(c?.team?.id);
      if (!Number.isFinite(id)) return null;
      return {
        id,
        name: c?.team?.displayName ?? c?.team?.shortDisplayName ?? `Team ${id}`,
        logo: c?.team?.logo ?? logoFor(id),
        score: toNumberOrNull(c?.score) ?? 0,
      };
    };

    const home = read("home");
    const away = read("away");
    if (!home || !away) continue;

    out.push({
      id: String(event.id ?? ""),
      competitionId: competition.id,
      clock: event.status?.displayClock ?? "",
      phase: type.description ?? "In progress",
      home,
      away,
    });
  }
  return out;
}

/**
 * Today's scoreboard, on a very short cache. The season-wide fetch is held for
 * hours, which is far too stale to show a score that is still changing, so live
 * matches get their own request — but only when a tracked club is actually
 * playing, so this costs nothing on a quiet day.
 */
async function getLiveMatches(teams: Team[]): Promise<LiveMatch[]> {
  const wanted = new Set(teams.map((t) => t.id));
  const live: LiveMatch[] = [];

  const perCompetition = await Promise.all(
    COMPETITIONS.map(async (competition) => {
      try {
        const { data } = await swr(`live:${competition.slug}`, LIVE_TTL, async () =>
          readLive(
            await espn(`${ESPN_SITE}/${competition.slug}/scoreboard`),
            competition,
          ),
        );
        return data;
      } catch {
        return [] as CachedLive[];
      }
    }),
  );

  for (const matches of perCompetition) {
    for (const match of matches) {
      for (const [side, other] of [
        [match.home, match.away],
        [match.away, match.home],
      ] as const) {
        if (!wanted.has(side.id)) continue;
        live.push({
          fixtureId: Number(match.id) || 0,
          teamId: side.id,
          competitionId: match.competitionId,
          competitionName:
            COMPETITIONS.find((c) => c.id === match.competitionId)?.name ?? "",
          opponent: other.name,
          opponentLogo: other.logo,
          home: side.id === match.home.id,
          goalsFor: side.score,
          goalsAgainst: other.score,
          clock: match.clock,
          phase: match.phase,
        });
      }
    }
  }

  return live;
}

/* ----------------------------------------------------------- stat leaders */

const ESPN_CORE_V2 = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";
const LEADERS_TTL = envInt("LEADERS_TTL", 60 * 60 * 12);

export type StatLine = {
  athleteId: string;
  teamId: number;
  value: number;
};

/** goals / assists / saves, per athlete, summed across the six competitions. */
export type LeaderBoards = {
  goals: StatLine[];
  assists: StatLine[];
  saves: StatLine[];
  available: boolean;
  notices: string[];
};

const CATEGORY_MAP: Record<string, keyof Omit<LeaderBoards, "available" | "notices">> = {
  goals: "goals",
  goalsLeaders: "goals",
  assists: "assists",
  assistsLeaders: "assists",
  saves: "saves",
};

type RawLeaderCategory = {
  name?: string;
  leaders?: {
    value?: number;
    athlete?: { $ref?: string };
    team?: { $ref?: string };
  }[];
};

function idFromRef(ref: string | undefined, kind: "athletes" | "teams"): string | null {
  const m = ref?.match(new RegExp(`/${kind}/(\\d+)`));
  return m ? m[1] : null;
}

function readLeaders(payload: unknown): Record<string, StatLine[]> {
  const categories = (payload as { categories?: RawLeaderCategory[] })?.categories ?? [];
  const out: Record<string, StatLine[]> = { goals: [], assists: [], saves: [] };
  const seen = new Set<string>();

  for (const category of categories) {
    const bucket = category.name ? CATEGORY_MAP[category.name] : undefined;
    if (!bucket) continue;
    for (const entry of category.leaders ?? []) {
      const athleteId = idFromRef(entry.athlete?.$ref, "athletes");
      const teamId = Number(idFromRef(entry.team?.$ref, "teams"));
      const value = entry.value;
      if (!athleteId || !Number.isFinite(teamId) || typeof value !== "number") continue;
      // "goals" and "goalsLeaders" are the same list under two names.
      const dedupe = `${bucket}:${athleteId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out[bucket].push({ athleteId, teamId, value });
    }
  }
  return out;
}

/**
 * Top 25 per category per competition, summed per athlete. ESPN publishes
 * nothing until a season is under way, so a 404 here is normal in August and
 * simply means no stat awards are live yet.
 */
export async function getLeaders(): Promise<LeaderBoards> {
  const totals: Record<string, Map<string, StatLine>> = {
    goals: new Map(),
    assists: new Map(),
    saves: new Map(),
  };
  const notices: string[] = [];
  let available = false;

  const fetched = await Promise.all(
    COMPETITIONS.map(async (competition) => {
      try {
        const { data } = await swr(
          `leaders:${competition.slug}:${TRACK_SEASON}`,
          LEADERS_TTL,
          async () =>
            readLeaders(
              await espn(
                `${ESPN_CORE_V2}/${competition.slug}/seasons/${TRACK_SEASON}/types/1/leaders`,
              ),
            ),
        );
        return { competition, data, ok: true as const };
      } catch (err) {
        return {
          competition,
          data: null,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  for (const result of fetched) {
    if (!result.ok || !result.data) continue;
    available = true;
    for (const bucket of ["goals", "assists", "saves"] as const) {
      for (const line of result.data[bucket] ?? []) {
        const running = totals[bucket].get(line.athleteId);
        if (running) {
          running.value += line.value;
          running.teamId = line.teamId;
        } else {
          totals[bucket].set(line.athleteId, { ...line });
        }
      }
    }
  }

  if (!available) {
    notices.push(
      `No player statistics published for ${seasonLabel(
        TRACK_SEASON,
      )} yet, so the stat awards are not live. They appear once the season is under way.`,
    );
  }

  const sorted = (m: Map<string, StatLine>) =>
    [...m.values()].sort((a, b) => b.value - a.value);

  return {
    goals: sorted(totals.goals),
    assists: sorted(totals.assists),
    saves: sorted(totals.saves),
    available,
    notices,
  };
}

/** Resolves an athlete id to a display name. One small cached request each. */
export async function athleteName(athleteId: string): Promise<string> {
  try {
    const { data } = await swr(
      `athlete:${athleteId}`,
      60 * 60 * 24 * 30,
      async () => {
        const payload = (await espn(
          `${ESPN_CORE_V2}/${SERIE_A.slug}/seasons/${TRACK_SEASON}/athletes/${athleteId}`,
        )) as { displayName?: string; fullName?: string };
        return payload?.displayName ?? payload?.fullName ?? "";
      },
    );
    return data || "a player";
  } catch {
    return "a player";
  }
}

/**
 * Ranked individual stats among the clubs in this game. Names cost one small
 * request each, cached for a month, so only the rows actually shown are
 * resolved — and they are fetched together rather than one after another.
 */
export async function getPlayerBoards(teams: Team[]): Promise<{
  boards: PlayerBoard[];
  notices: string[];
}> {
  const perTeam = new Map(teams.map((t) => [t.id, t]));
  const leaders = await getLeaders();

  const categories: [string, string, string, StatLine[]][] = [
    ["goals", "Top scorers", "goals", leaders.goals],
    ["assists", "Most assists", "assists", leaders.assists],
    [
      "contributions",
      "Goals + assists",
      "G+A",
      mergeStats(leaders.goals, leaders.assists),
    ],
    ["saves", "Most saves", "saves", leaders.saves],
  ];

  const shortlists = categories.map(([key, label, unit, lines]) => ({
    key,
    label,
    unit,
    lines: lines
      .filter((l) => perTeam.has(l.teamId) && l.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
  }));

  // One lookup per distinct athlete across every board.
  const ids = [...new Set(shortlists.flatMap((s) => s.lines.map((l) => l.athleteId)))];
  const names = new Map(
    await Promise.all(ids.map(async (id) => [id, await athleteName(id)] as const)),
  );

  const boards: PlayerBoard[] = shortlists.map((s) => ({
    key: s.key,
    label: s.label,
    unit: s.unit,
    rows: s.lines.map((l) => {
      const team = perTeam.get(l.teamId);
      return {
        athleteId: l.athleteId,
        name: names.get(l.athleteId) ?? "a player",
        teamId: l.teamId,
        teamName: team?.name ?? `Team ${l.teamId}`,
        teamLogo: team?.logo ?? logoFor(l.teamId),
        value: l.value,
      };
    }),
  }));

  return { boards, notices: leaders.notices };
}

function mergeStats(a: StatLine[], b: StatLine[]): StatLine[] {
  const merged = new Map<string, StatLine>();
  for (const line of [...a, ...b]) {
    const running = merged.get(line.athleteId);
    if (running) running.value += line.value;
    else merged.set(line.athleteId, { ...line });
  }
  return [...merged.values()];
}

/* ----------------------------------------------------------- head to head */

const H2H_TTL = envInt("H2H_TTL", 60 * 60 * 12);

type RawSeries = {
  type?: string;
  summary?: string;
  events?: {
    date?: string;
    competitors?: {
      homeAway?: string;
      winner?: boolean;
      score?: string;
      team?: { id?: string; displayName?: string; abbreviation?: string };
    }[];
  }[];
};

/**
 * Previous meetings between the two clubs in a fixture. ESPN carries this on
 * the match summary as `seasonseries`, already worded ("COMO leads series
 * 2-1-2"), which beats inventing a record from partial data.
 */
export async function getHeadToHead(
  competitionId: number,
  fixtureId: number,
): Promise<HeadToHead | null> {
  const competition = COMPETITIONS.find((c) => c.id === competitionId);
  if (!competition || !fixtureId) return null;

  try {
    const { data } = await swr(`h2h:${competition.slug}:${fixtureId}`, H2H_TTL, async () => {
      const payload = (await espn(
        `${ESPN_SITE}/${competition.slug}/summary?event=${fixtureId}`,
      )) as { seasonseries?: RawSeries[] };

      const series = payload?.seasonseries?.find((s) => s.type === "head-to-head");
      if (!series) return null;

      const meetings: HeadToHeadMeeting[] = [];
      for (const event of series.events ?? []) {
        const home = event.competitors?.find((c) => c.homeAway === "home");
        const away = event.competitors?.find((c) => c.homeAway === "away");
        const homeId = Number(home?.team?.id);
        const awayId = Number(away?.team?.id);
        const homeScore = toNumberOrNull(home?.score);
        const awayScore = toNumberOrNull(away?.score);
        if (
          !Number.isFinite(homeId) ||
          !Number.isFinite(awayId) ||
          homeScore === null ||
          awayScore === null ||
          !event.date
        ) {
          continue;
        }
        meetings.push({
          date: event.date,
          homeTeamId: homeId,
          homeName: home?.team?.displayName ?? "",
          homeScore,
          awayTeamId: awayId,
          awayName: away?.team?.displayName ?? "",
          awayScore,
        });
      }

      meetings.sort((a, b) => b.date.localeCompare(a.date));
      return { summary: series.summary ?? "", meetings } satisfies HeadToHead;
    });
    return data;
  } catch {
    return null;
  }
}

/** The club's leading scorer this season, for fixture previews. */
export async function topScorerFor(
  teamId: number,
): Promise<{ name: string; goals: number } | null> {
  try {
    const leaders = await getLeaders();
    const best = leaders.goals
      .filter((l) => l.teamId === teamId && l.value > 0)
      .sort((a, b) => b.value - a.value)[0];
    if (!best) return null;
    return { name: await athleteName(best.athleteId), goals: best.value };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- league position */

/**
 * Positions in the tracked season, for finishing-place bonuses. Shares the
 * cached table with the standings the page renders, so it costs no extra call.
 */
export async function getLeagueTable(): Promise<{
  positions: Record<number, number>;
  available: boolean;
}> {
  try {
    const { rows } = await getFullTable(TRACK_SEASON);
    const positions: Record<number, number> = {};
    // Nobody has a meaningful position before a ball is kicked.
    const started = rows.some((r) => r.played > 0);
    if (started) for (const row of rows) positions[row.teamId] = row.rank;
    return { positions, available: started && rows.length > 0 };
  } catch {
    return { positions: {}, available: false };
  }
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
