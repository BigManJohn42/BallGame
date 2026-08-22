import type { Movement } from "./types";

/**
 * Leaderboard movement, kept free of storage and network so it can be reasoned
 * about (and tested) on its own. game.ts supplies the persistence.
 *
 * Movement is measured against the last time a match was actually played rather
 * than against a clock. Between gameweeks the arrows hold still, which is what
 * makes them worth looking at — a timer-based baseline would quietly reset to
 * zero while nothing had happened.
 */

export type Standing = { rank: number; points: number };

export type Snapshot = {
  at: number;
  playedTotal: number;
  entries: Record<string, Standing>;
};

export type History = { previous: Snapshot | null; current: Snapshot | null };

export type RankedRow = { rank: number; playerId: string; points: number };

export function snapshotOf(rows: RankedRow[], playedTotal: number, at: number): Snapshot {
  return {
    at,
    playedTotal,
    entries: Object.fromEntries(
      rows.map((r) => [r.playerId, { rank: r.rank, points: r.points }]),
    ),
  };
}

/**
 * Decides what to compare against and whether the stored history needs
 * rewriting. `save` is null when nothing has changed, so a quiet page load does
 * no writes at all.
 */
export function advanceHistory(
  history: History | null,
  snapshot: Snapshot,
): { baseline: Snapshot | null; save: History | null } {
  // Nothing recorded yet: lay down a baseline and show no movement.
  if (!history?.current) {
    return { baseline: null, save: { previous: null, current: snapshot } };
  }

  // Results have moved on, so the previous standings become the comparison.
  if (history.current.playedTotal !== snapshot.playedTotal) {
    return {
      baseline: history.current,
      save: { previous: history.current, current: snapshot },
    };
  }

  // Same gameweek: keep comparing against the same baseline, write nothing.
  return { baseline: history.previous, save: null };
}

export function diffAgainst(
  baseline: Snapshot | null,
  rows: RankedRow[],
): Record<string, Movement> {
  if (!baseline) return {};

  const movement: Record<string, Movement> = {};
  for (const row of rows) {
    const before = baseline.entries[row.playerId];
    // A player who joined after the baseline has nothing to be compared to.
    if (!before) continue;
    movement[row.playerId] = {
      rankChange: before.rank - row.rank,
      pointsGained: row.points - before.points,
    };
  }
  return movement;
}
