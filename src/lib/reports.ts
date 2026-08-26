import type { FormPlayer, MatchEvent, MatchReport, PlayedMatch } from "./types";

/**
 * Short match reports and recent-form tallies, written from the goals that
 * actually went in. Pure: the fetching lives in football.ts.
 */

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function scorerPhrase(events: MatchEvent[]): string {
  // Two goals from the same player read as one entry, not two.
  const byScorer = new Map<string, string[]>();
  for (const e of events) {
    const minutes = byScorer.get(e.scorer) ?? [];
    minutes.push(e.minute || "");
    byScorer.set(e.scorer, minutes);
  }
  return list(
    [...byScorer].map(([name, minutes]) => {
      const shown = minutes.filter(Boolean);
      return shown.length ? `${name} (${shown.join(", ")})` : name;
    }),
  );
}

/**
 * Splits a side's goals into the sentences that describe them. Kept apart so
 * the assist line can follow the goal it set up rather than trailing an own
 * goal that had nothing to do with it.
 */
function goalSentences(
  events: MatchEvent[],
  scoredVerb: string,
  fallbackCount: number,
): { scored: string | null; assists: string | null; own: string | null } {
  const proper = events.filter((e) => !e.ownGoal);
  const own = events.filter((e) => e.ownGoal);

  let scored: string | null = null;
  if (proper.length) {
    scored = `${scorerPhrase(proper)} ${scoredVerb}.`;
  } else if (!events.length && fallbackCount > 0) {
    // The goals went in but this fixture has no event detail.
    scored =
      fallbackCount === 1
        ? "One goal, scorer not recorded."
        : `${fallbackCount} goals, scorers not recorded.`;
  }

  const names = [
    ...new Set(proper.map((e) => e.assist).filter((a): a is string => Boolean(a))),
  ];

  return {
    scored,
    assists: names.length
      ? `${list(names)} provided the ${names.length > 1 ? "assists" : "assist"}.`
      : null,
    own: own.length
      ? `${own.length > 1 ? "Own goals" : "An own goal"} from ${scorerPhrase(own)}.`
      : null,
  };
}

export function buildReport(input: {
  match: PlayedMatch;
  teamName: string;
  teamLogo: string;
  events: MatchEvent[] | null;
}): MatchReport {
  const { match, teamName } = input;
  const events = input.events ?? [];

  // ESPN puts the team that BENEFITS on the event, so an own goal already
  // carries the id of the side it counts for. No flipping required — doing so
  // was what previously turned a 3-3 into four goals for one team and two for
  // the other.
  const ours = events.filter((e) => e.teamId === match.teamId);
  const theirs = events.filter((e) => e.teamId !== match.teamId);

  const headline = match.home
    ? `${teamName} ${match.goalsFor}-${match.goalsAgainst} ${match.opponent}`
    : `${match.opponent} ${match.goalsAgainst}-${match.goalsFor} ${teamName}`;

  const sentences: string[] = [];

  const verdict =
    match.outcome === "W"
      ? match.viaPenalties
        ? "through on penalties"
        : "a win"
      : match.outcome === "D"
        ? "a draw"
        : match.viaPenalties
          ? "out on penalties"
          : "a defeat";

  sentences.push(
    `${verdict[0].toUpperCase()}${verdict.slice(1)} ${
      match.home ? "at home to" : "away at"
    } ${match.opponent} in the ${match.competitionName}.`,
  );

  if (match.goalsFor === 0) {
    sentences.push("No goals at the right end.");
  } else {
    const us = goalSentences(ours, "scored", match.goalsFor);
    sentences.push(...[us.scored, us.assists, us.own].filter((s): s is string => Boolean(s)));
  }

  if (match.goalsAgainst === 0) {
    sentences.push("A clean sheet at the back.");
  } else {
    const them = goalSentences(theirs, "replied", match.goalsAgainst);
    sentences.push(...[them.scored, them.own].filter((s): s is string => Boolean(s)));
  }

  sentences.push(
    `Worth ${match.points} ${match.points === 1 ? "point" : "points"}.`,
  );

  return {
    fixtureId: match.fixtureId,
    teamId: match.teamId,
    teamName,
    teamLogo: input.teamLogo,
    date: match.date,
    competitionId: match.competitionId,
    competitionName: match.competitionName,
    headline,
    outcome: match.outcome,
    goalsFor: match.goalsFor,
    goalsAgainst: match.goalsAgainst,
    points: match.points,
    body: sentences.join(" "),
    scorers: ours.map((e) => ({
      name: e.scorer,
      minute: e.minute,
      assist: e.ownGoal ? null : e.assist,
      penalty: e.penalty,
      ownGoal: e.ownGoal,
    })),
    detailed: events.length > 0,
  };
}

/**
 * Who has actually been doing it lately, over the club's most recent matches.
 * Deliberately separate from the season leaders: a player can top the season
 * chart having not scored since October.
 */
export function inForm(input: {
  teamId: number;
  matches: { match: PlayedMatch; events: MatchEvent[] | null }[];
  window: number;
}): FormPlayer[] {
  const recent = input.matches.slice(0, input.window);
  const tally = new Map<string, FormPlayer>();
  let counted = 0;

  for (const { events } of recent) {
    if (!events) continue;
    counted += 1;
    for (const e of events) {
      if (e.ownGoal) continue;
      if (e.teamId !== input.teamId) continue;

      const scorer = tally.get(e.scorer) ?? { name: e.scorer, goals: 0, assists: 0, points: 0 };
      scorer.goals += 1;
      tally.set(e.scorer, scorer);

      if (e.assist) {
        const helper = tally.get(e.assist) ?? { name: e.assist, goals: 0, assists: 0, points: 0 };
        helper.assists += 1;
        tally.set(e.assist, helper);
      }
    }
  }

  if (!counted) return [];

  return [...tally.values()]
    .map((p) => ({ ...p, points: p.goals * 2 + p.assists }))
    .sort((a, b) => b.points - a.points || b.goals - a.goals)
    .slice(0, 5);
}
