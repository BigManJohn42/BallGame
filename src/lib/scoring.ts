import { competitionById } from "./competitions";
import type { Outcome } from "./types";

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Bonus points on top of the result, tuneable without touching code. */
export const GOAL_BONUS = envNum("POINTS_PER_GOAL", 1);
export const CLEAN_SHEET_BONUS = envNum("POINTS_CLEAN_SHEET", 2);

/**
 * How far a club got in a knockout competition. Only the highest rung reached
 * is paid out, so these are cumulative-feeling totals rather than increments.
 * `rank` orders the ladder; the slug matchers are deliberately loose because
 * each competition names its rounds slightly differently.
 */
export type Round = {
  rank: number;
  key: string;
  label: string;
  points: number;
  match: RegExp;
};

// Ordered by rank. The patterns are mutually exclusive, so the first match
// wins: "semifinals" is caught by /semi/ before /^final/ ever sees it.
export const ROUNDS: Round[] = [
  { rank: 1, key: "group", label: "League phase", points: 0, match: /league-phase|group/ },
  { rank: 2, key: "playoff", label: "Knockout playoff", points: envNum("POINTS_ROUND_PLAYOFF", 1), match: /playoff/ },
  { rank: 3, key: "r32", label: "Round of 32", points: envNum("POINTS_ROUND_32", 2), match: /round-of-32|^second-round/ },
  { rank: 4, key: "r16", label: "Round of 16", points: envNum("POINTS_ROUND_16", 3), match: /round-of-16/ },
  { rank: 5, key: "qf", label: "Quarter-final", points: envNum("POINTS_ROUND_QF", 5), match: /quarter/ },
  { rank: 6, key: "sf", label: "Semi-final", points: envNum("POINTS_ROUND_SF", 7), match: /semi/ },
  { rank: 7, key: "final", label: "Final", points: envNum("POINTS_ROUND_FINAL", 8), match: /^final/ },
];

export const R16_RANK = 4;

/** Paid instead of the plain final bonus when the club actually lifts it. */
export const TROPHY_POINTS = envNum("POINTS_TROPHY", 10);

/**
 * European clubs finishing top eight of the league phase go straight to the
 * last 16; everyone from ninth down has to win a knockout playoff to get there.
 * Both end up in the same round, so without this the stronger league-phase
 * campaign counts for nothing.
 */
export const AUTO_R16_POINTS = envNum("POINTS_AUTO_R16", 3);

/**
 * Maps a round slug to a rung on the ladder. Early qualifying rounds
 * ("preliminary-round", "first-round") deliberately match nothing — reaching
 * them is not an achievement worth paying for.
 */
export function roundFor(slug: string): Round | null {
  const s = slug.toLowerCase();
  for (const round of ROUNDS) {
    if (round.match.test(s)) return round;
  }
  return null;
}

/** Serie A finishing position, paid at season end. */
export const LEAGUE_FINISH = {
  champions: envNum("POINTS_FINISH_CHAMPIONS", 12),
  ucl: envNum("POINTS_FINISH_UCL", 8),
  europa: envNum("POINTS_FINISH_EUROPA", 5),
  conference: envNum("POINTS_FINISH_CONFERENCE", 3),
};

/** One-off awards for topping a statistical category among the game's clubs. */
export const STAT_AWARD_POINTS = envNum("POINTS_STAT_AWARD", 5);

/**
 * Points for one played match, from the perspective of the tracked team.
 * Result value comes from the competition table (a Champions League win is
 * worth more than a Conference League one); goals and clean sheets are flat.
 */
export function matchPoints(input: {
  competitionId: number;
  outcome: Outcome;
  goalsFor: number;
  goalsAgainst: number;
}): number {
  const comp = competitionById(input.competitionId);
  const win = comp?.win ?? 3;
  const draw = comp?.draw ?? 1;

  let points = input.outcome === "W" ? win : input.outcome === "D" ? draw : 0;
  points += input.goalsFor * GOAL_BONUS;
  if (input.goalsAgainst === 0) points += CLEAN_SHEET_BONUS;
  return points;
}

/**
 * Work out the result for `teamId`. Knockout ties settled on penalties count as
 * a win/loss for whoever went through, not as a draw.
 */
export function outcomeFor(args: {
  teamId: number;
  homeId: number;
  goalsHome: number;
  goalsAway: number;
  penaltyHome: number | null;
  penaltyAway: number | null;
}): { outcome: Outcome; viaPenalties: boolean } {
  const isHome = args.teamId === args.homeId;
  const mine = isHome ? args.goalsHome : args.goalsAway;
  const theirs = isHome ? args.goalsAway : args.goalsHome;

  if (mine > theirs) return { outcome: "W", viaPenalties: false };
  if (mine < theirs) return { outcome: "L", viaPenalties: false };

  const pMine = isHome ? args.penaltyHome : args.penaltyAway;
  const pTheirs = isHome ? args.penaltyAway : args.penaltyHome;
  if (typeof pMine === "number" && typeof pTheirs === "number" && pMine !== pTheirs) {
    return { outcome: pMine > pTheirs ? "W" : "L", viaPenalties: true };
  }
  return { outcome: "D", viaPenalties: false };
}
