import type { LeaderboardRow, PlayedMatch, WeeklySummary } from "./types";

/**
 * What changed since the last gameweek, in a form that can be read at a glance
 * or pasted straight into a group chat. Pure: it only rearranges what the
 * leaderboard already knows.
 */

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function buildSummary(input: {
  rows: LeaderboardRow[];
  played: PlayedMatch[];
  since: number | null;
  now: number;
}): WeeklySummary {
  const { rows, since, now } = input;

  // Only matches played since the baseline count towards "this week".
  const window = since
    ? input.played.filter((m) => Date.parse(m.date) > since)
    : [];

  const standings = rows.map((row) => ({
    rank: row.rank,
    name: row.player.name,
    team: row.player.teamName,
    points: row.score.points,
    rankChange: row.movement?.rankChange ?? null,
    pointsGained: row.movement?.pointsGained ?? 0,
  }));

  const scored = standings.filter((s) => s.pointsGained > 0);
  const topEarner =
    scored.length > 0
      ? scored.reduce((best, s) => (s.pointsGained > best.pointsGained ? s : best))
      : null;

  const climbers = standings.filter((s) => (s.rankChange ?? 0) > 0);
  const biggestClimb =
    climbers.length > 0
      ? climbers.reduce((best, s) =>
          (s.rankChange ?? 0) > (best.rankChange ?? 0) ? s : best,
        )
      : null;

  const ownerOf = new Map(rows.map((r) => [r.player.teamId, r.player.name]));
  const bestMatch =
    window.length > 0
      ? window.reduce((best, m) => (m.points > best.points ? m : best))
      : null;

  const bestResult = bestMatch
    ? {
        player: ownerOf.get(bestMatch.teamId) ?? "",
        opponent: bestMatch.opponent,
        home: bestMatch.home,
        goalsFor: bestMatch.goalsFor,
        goalsAgainst: bestMatch.goalsAgainst,
        competition: bestMatch.competitionName,
        points: bestMatch.points,
      }
    : null;

  /* ------------------------------------------------------- pasteable text */

  const lines: string[] = [];
  lines.push(
    since ? `BallGame — ${shortDate(since)} to ${shortDate(now)}` : "BallGame — standings",
  );
  lines.push("");
  for (const s of standings) {
    const arrow =
      s.rankChange === null || s.rankChange === 0
        ? "  "
        : s.rankChange > 0
          ? `+${s.rankChange}`
          : `${s.rankChange}`;
    const gained = s.pointsGained > 0 ? ` (+${s.pointsGained})` : "";
    lines.push(`${s.rank}. ${s.name} — ${s.team} — ${s.points}${gained} ${arrow}`.trimEnd());
  }
  if (bestResult) {
    lines.push("");
    lines.push(
      `Result of the week: ${bestResult.player} — ${
        bestResult.home ? "vs" : "at"
      } ${bestResult.opponent} ${bestResult.goalsFor}-${bestResult.goalsAgainst} (+${
        bestResult.points
      })`,
    );
  }
  if (!window.length) {
    lines.push("");
    lines.push("No matches played yet this week.");
  }

  return {
    since,
    matchesPlayed: window.length,
    standings,
    topEarner,
    biggestClimb,
    bestResult,
    text: lines.join("\n"),
  };
}
