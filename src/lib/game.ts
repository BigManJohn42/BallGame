import { COMPETITIONS } from "./competitions";
import {
  DRAW_SEASON,
  TRACK_SEASON,
  getDrawPool,
  getResults,
  seasonLabel,
} from "./football";
import { CLEAN_SHEET_BONUS, GOAL_BONUS } from "./scoring";
import { getStore } from "./store";
import type { GameState, LeaderboardRow, Player, Team, TeamScore } from "./types";

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

export function buildLeaderboard(
  players: Player[],
  scores: Record<number, TeamScore>,
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
    return { rank, player: row.player, score: row.score };
  });
}

/** Everything the front page renders, in a single round trip. */
export async function getGameState(me: Player | null): Promise<GameState> {
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
  const leaderboard = buildLeaderboard(players, results.scores);

  // Show only clubs somebody actually holds once the game has started; before
  // that, show the whole pool so the page is not empty on arrival.
  const owned = new Set(players.map((p) => p.teamId));
  const inFeed = (teamId: number) => owned.size === 0 || owned.has(teamId);

  const notices = [...storeErrors, ...pool.notices, ...results.notices];
  if (store.kind === "memory") {
    notices.push(
      "No Redis connected: players and scores live in memory only and will vanish between deploys. Add an Upstash/Vercel KV store for real persistence.",
    );
  }

  return {
    me,
    teams: pool.teams,
    leaderboard,
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
      notices,
    },
  };
}

