import {
  assistPhrase,
  blankedPhrase,
  cleanSheetPhrase,
  haulPhrase,
  latePhrase,
  opener,
  pointsPhrase,
  repliedVerb,
  scoredVerb,
  seedFrom,
  shapeOf,
} from "./voice";
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
  verb: string,
  fallbackCount: number,
  seed: number,
): { scored: string | null; assists: string | null; own: string | null } {
  const proper = events.filter((e) => !e.ownGoal);
  const own = events.filter((e) => e.ownGoal);

  let scored: string | null = null;
  if (proper.length) {
    scored = `${scorerPhrase(proper)} ${verb}.`;
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
    assists: names.length ? assistPhrase(list(names), names.length > 1, seed) : null,
    own: own.length
      ? `${own.length > 1 ? "Own goals" : "An own goal"} from ${scorerPhrase(own)}.`
      : null,
  };
}

/** "88'" or "90'+3'" counts as late; "8'" does not. */
function lateMinute(minute: string): boolean {
  const first = Number.parseInt(minute.replace(/[^0-9].*$/, ""), 10);
  return Number.isFinite(first) && first >= 85;
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

  // Seeded on the fixture, so a given match always reads the same way.
  const seed = seedFrom(`${match.fixtureId}:${match.teamId}`);
  const shape = shapeOf(match);
  const sentences: string[] = [];

  // The competition is already on the card above the body, so it is left out
  // here rather than trailing the opener as a fragment.
  sentences.push(opener(shape, match.home ? "at home to" : "away at", match.opponent, seed));

  if (match.goalsFor > 0) {
    const us = goalSentences(ours, scoredVerb(seed), match.goalsFor, seed);
    sentences.push(...[us.scored, us.assists, us.own].filter((s): s is string => Boolean(s)));

    // Call out a brace or better rather than leaving it buried in a list.
    const counts = new Map<string, number>();
    for (const e of ours.filter((e) => !e.ownGoal)) {
      counts.set(e.scorer, (counts.get(e.scorer) ?? 0) + 1);
    }
    for (const [name, goals] of counts) {
      const haul = haulPhrase(name, goals, seed);
      if (haul) sentences.push(haul);
    }

    // Only a late goal that actually decided it earns a line. Any other one is
    // already in the scorer list with its minute, so saying it twice reads as
    // padding.
    const decisive = match.outcome === "W" && match.goalsFor - match.goalsAgainst === 1;
    const late = ours.find((e) => !e.ownGoal && lateMinute(e.minute));
    if (late && decisive) {
      sentences.push(latePhrase(late.minute, late.scorer, true, seed));
    }
  }

  if (match.goalsFor === 0) sentences.push(blankedPhrase(seed));

  if (match.goalsAgainst === 0 && match.goalsFor > 0) {
    sentences.push(cleanSheetPhrase(seed));
  } else if (match.goalsAgainst > 0) {
    const them = goalSentences(
      theirs,
      repliedVerb(seed, match.goalsAgainst > 1, match.goalsFor > 0),
      match.goalsAgainst,
      seed,
    );
    sentences.push(...[them.scored, them.own].filter((s): s is string => Boolean(s)));
  }

  sentences.push(pointsPhrase(match.points, seed));

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
