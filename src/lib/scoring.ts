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
