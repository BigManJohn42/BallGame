import { awardCatalogue, computeAwards } from "./awards";
import { clubProfile } from "./clubs";
import { COMPETITIONS } from "./competitions";
import { findDerbies } from "./derbies";
import {
  DRAW_SEASON,
  TRACK_SEASON,
  getDrawPool,
  getFullTable,
  getPlayerBoards,
  getResults,
  seasonLabel,
} from "./football";
import {
  advanceHistory,
  diffAgainst,
  snapshotOf,
  type History,
  type RankedRow,
} from "./movement";
import { CLEAN_SHEET_BONUS, GOAL_BONUS } from "./scoring";
import { buildSummary } from "./summary";
import { getStore } from "./store";
import type {
  Derby,
  Award,
  ClubSeason,
  GameState,
  LeaderboardRow,
  LeagueRow,
  Movement,
  Player,
  Team,
  TeamScore,
} from "./types";

export const MAX_NAME_LENGTH = 24;

export function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) return null;
  // Letters (any alphabet), digits, spaces and a few friendly separators.
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) return null;
  return name;
}

function randomIndex(length: number): number {
  if (length <= 1) return 0;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % length;
}

/**
 * Draws a club for a new player. Every team gets a first owner before any team
 * gets a second, so a group of seven or fewer all end up with different clubs.
 */
export function drawTeam(pool: Team[], players: Player[]): Team {
  const counts = new Map<number, number>(pool.map((t) => [t.id, 0] as const));
  for (const player of players) {
    if (counts.has(player.teamId)) {
      counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
    }
  }
  const fewest = Math.min(...counts.values());
  const candidates = pool.filter((t) => (counts.get(t.id) ?? 0) === fewest);
  return candidates[randomIndex(candidates.length)];
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

/* -------------------------------------------------------------- movement */

const HISTORY_KEY = "standings-history";
const HISTORY_TTL = 60 * 60 * 24 * 400; // a season and then some

/** Persistence around the pure logic in movement.ts. */
async function readMovement(
  rows: LeaderboardRow[],
  playedTotal: number,
): Promise<{ movement: Record<string, Movement>; since: number | null }> {
  const store = getStore();
  const ranked: RankedRow[] = rows.map((r) => ({
    rank: r.rank,
    playerId: r.player.id,
    points: r.score.points,
  }));

  let history: History | null = null;
  try {
    history = await store.cacheGet<History>(HISTORY_KEY);
  } catch {
    return { movement: {}, since: null };
  }

  const { baseline, save } = advanceHistory(
    history,
    snapshotOf(ranked, playedTotal, Date.now()),
  );
  if (save) {
    await store.cacheSet<History>(HISTORY_KEY, save, HISTORY_TTL).catch(() => {});
  }
  return { movement: diffAgainst(baseline, ranked), since: baseline?.at ?? null };
}

export function buildLeaderboard(
  players: Player[],
  scores: Record<number, TeamScore>,
  movement: Record<string, Movement> = {},
): LeaderboardRow[] {
  const rows = players
    .map((player) => ({ player, score: scores[player.teamId] ?? emptyScore(player.teamId) }))
    .sort((a, b) => {
      const byPoints = b.score.points - a.score.points;
      if (byPoints) return byPoints;
      const byDiff =
        b.score.goalsFor - b.score.goalsAgainst - (a.score.goalsFor - a.score.goalsAgainst);
      if (byDiff) return byDiff;
      const byWins = b.score.wins - a.score.wins;
      if (byWins) return byWins;
      return a.player.joinedAt - b.player.joinedAt;
    });

  let lastPoints: number | null = null;
  let lastRank = 0;
  return rows.map((row, i) => {
    const rank = lastPoints === row.score.points ? lastRank : i + 1;
    lastPoints = row.score.points;
    lastRank = rank;
    return {
      rank,
      player: row.player,
      score: row.score,
      movement: movement[row.player.id] ?? null,
    };
  });
}

/**
 * Everything the season is made of, unsliced. Both the front page and the
 * per-club view are built from this, so they can never disagree.
 */
async function assembleSeason() {
  const store = getStore();
  const storeErrors: string[] = [];
  const [pool, players] = await Promise.all([
    getDrawPool(),
    store.listPlayers().catch((err: unknown) => {
      storeErrors.push(
        `Could not read the player list: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [] as Player[];
    }),
  ]);

  // Track the draw pool plus any club a player already holds, so nobody's score
  // freezes if the pinned seven ever change mid-season.
  const tracked = new Map<number, Team>(pool.teams.map((t) => [t.id, t] as const));
  for (const player of players) {
    if (!tracked.has(player.teamId)) {
      tracked.set(player.teamId, {
        id: player.teamId,
        name: player.teamName,
        logo: player.teamLogo,
        rank: player.teamRank,
      });
    }
  }

  const results = await getResults([...tracked.values()]);

  // Bonus awards sit on top of match points: stat titles, cup runs, and where
  // the club sits in Serie A.
  const trackedTeams = [...tracked.values()];
  const bonus = await computeAwards({
    teams: trackedTeams,
    played: results.played,
    upcoming: results.upcoming,
    scores: results.scores,
  }).catch((err: unknown) => {
    return {
      awards: {} as Record<number, Award[]>,
      notices: [
        `Bonus awards unavailable: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  });

  for (const team of trackedTeams) {
    const score = results.scores[team.id];
    if (!score) continue;
    score.awards = bonus.awards[team.id] ?? [];
    score.bonusPoints = score.awards.reduce((n, a) => n + a.points, 0);
    score.points = score.matchPoints + score.bonusPoints;
  }

  // Ranked once without movement, then again with it, so the arrows compare
  // like for like.
  const ranked = buildLeaderboard(players, results.scores);
  const playedTotal = trackedTeams.reduce(
    (n, t) => n + (results.scores[t.id]?.played ?? 0),
    0,
  );
  const { movement, since } = await readMovement(ranked, playedTotal).catch(() => ({
    movement: {} as Record<string, Movement>,
    since: null,
  }));
  const leaderboard = buildLeaderboard(players, results.scores, movement);

  const summary = buildSummary({
    rows: leaderboard,
    played: results.played,
    since,
    now: Date.now(),
  });

  const table = await getFullTable(TRACK_SEASON)
    .then((t) => t.rows)
    .catch(() => [] as LeagueRow[]);

  const derbies = findDerbies({
    upcoming: results.upcoming,
    owners: new Map(players.map((p) => [p.teamId, p.name])),
    competitionName: (id) => COMPETITIONS.find((c) => c.id === id)?.name ?? "",
    now: Date.now(),
  });

  const notices = [...storeErrors, ...pool.notices, ...results.notices, ...bonus.notices];
  if (store.kind === "memory") {
    notices.push(
      "No Redis connected: players and scores live in memory only and will vanish between deploys. Add an Upstash/Vercel KV store for real persistence.",
    );
  }

  return {
    store,
    pool,
    players,
    trackedTeams,
    results,
    leaderboard,
    table,
    summary,
    derbies,
    notices,
  };
}

/** Everything the front page renders, in a single round trip. */
export async function getGameState(me: Player | null): Promise<GameState> {
  const s = await assembleSeason();
  const { store, pool, players, results, leaderboard, table, summary, derbies, notices } = s;

  // Show only clubs somebody actually holds once the game has started; before
  // that, show the whole pool so the page is not empty on arrival.
  const owned = new Set(players.map((p) => p.teamId));
  const inFeed = (teamId: number) => owned.size === 0 || owned.has(teamId);

  return {
    me,
    teams: pool.teams,
    leaderboard,
    table,
    summary,
    derbies,
    live: results.live,
    recent: results.played.filter((m) => inFeed(m.teamId)).slice(0, 24),
    upcoming: results.upcoming.filter((m) => inFeed(m.teamId)).slice(0, 12),
    meta: {
      drawSeason: seasonLabel(DRAW_SEASON),
      trackSeason: seasonLabel(TRACK_SEASON),
      teamsSource: pool.source,
      resultsSource: results.source,
      storage: store.kind,
      lastUpdated: results.lastUpdated,
      competitions: COMPETITIONS.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        short: c.short,
        win: c.win,
        draw: c.draw,
        accent: c.accent,
      })),
      bonuses: { goal: GOAL_BONUS, cleanSheet: CLEAN_SHEET_BONUS },
      awardCatalogue: awardCatalogue(),
      notices,
    },
  };
}


/**
 * One club's entire season — every result and every remaining fixture. Public:
 * anyone can look up anyone else's club, no cookie required.
 */
export async function getClubSeason(teamId: number): Promise<ClubSeason | null> {
  const { players, trackedTeams, results, table } = await assembleSeason();

  const team = trackedTeams.find((t) => t.id === teamId);
  if (!team) return null;

  const holder = players.find((p) => p.teamId === teamId) ?? null;
  const position = table.find((r) => r.teamId === teamId);

  // The club's own best performers, pulled from the same stat leaders that
  // decide the bonus awards. Failing here must not take the whole view down.
  const topPlayers = await getPlayerBoards([team])
    .then(({ boards }) =>
      boards
        .filter((b) => b.rows.length > 0)
        .map((b) => ({ label: b.label, unit: b.unit, rows: b.rows.slice(0, 3) })),
    )
    .catch(() => []);

  return {
    team,
    owner: holder ? { id: holder.id, name: holder.name } : null,
    score: results.scores[teamId] ?? emptyScore(teamId),
    // getResults returns played newest-first and upcoming soonest-first.
    played: results.played.filter((m) => m.teamId === teamId),
    upcoming: results.upcoming.filter((m) => m.teamId === teamId),
    leaguePosition: position && position.played > 0 ? position.rank : null,
    leagueRow: position ?? null,
    profile: clubProfile(teamId),
    topPlayers,
  };
}

/** The clubs whose results are being followed: the draw pool plus anything held. */
export async function getTrackedTeams(): Promise<Team[]> {
  const { trackedTeams } = await assembleSeason();
  return trackedTeams;
}
