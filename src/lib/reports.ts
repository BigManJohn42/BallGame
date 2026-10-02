import { list } from "./grammar";
import { type MatchShape, matchVoice, seedFrom, shapeOf } from "./voice";
import type { FormPlayer, MatchEvent, MatchReport, PlayedMatch } from "./types";

/**
 * Short match reports and recent-form tallies, written from the goals that
 * actually went in.
 *
 * The prose is generated: this module decides what is true about a match and
 * in what order to say it, and the grammar in voice.ts decides the words. Pure
 * — the fetching lives in football.ts.
 */

/** Two goals from the same player read as one entry, not two. */
function scorerNames(events: MatchEvent[]): string {
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

/** "90'+3'" sorts after "90'", which sorts after "88'". */
function minuteValue(minute: string): number {
  const parts = minute.match(/\d+/g);
  if (!parts?.length) return -1;
  return parts.reduce((total, part) => total + Number(part), 0);
}

/** "88'" or "90'+3'" counts as late; "8'" does not. */
function lateMinute(minute: string): boolean {
  const first = Number.parseInt(minute.replace(/[^0-9].*$/, ""), 10);
  return Number.isFinite(first) && first >= 85;
}

const SMALL = ["", "one", "two", "three", "four", "five", "six"];

/** "one more goal" reads better than "1 more goal". */
function countWord(n: number): string {
  return SMALL[n] ?? String(n);
}

function goalsBy(events: MatchEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.scorer, (counts.get(e.scorer) ?? 0) + 1);
  return counts;
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

  const shape: MatchShape = shapeOf(match);
  // Seeded on the fixture, so a given match always reads the same way.
  const voice = matchVoice(
    {
      shape,
      home: match.home,
      ourMany: match.goalsFor > 1,
      theirMany: match.goalsAgainst > 1,
      weScored: match.goalsFor > 0,
    },
    seedFrom(`${match.fixtureId}:${match.teamId}`),
  );

  const say = (symbol: string, vars: Record<string, string | number> = {}) =>
    voice.say(symbol, { opp: match.opponent, ...vars });

  const sentences: string[] = [];
  const push = (text: string) => {
    if (text) sentences.push(text);
  };

  /**
   * ESPN's event list can cover only some of a match's goals. Whatever it does
   * not name still has to be accounted for, or a 2-2 reads as though one side
   * scored once.
   */
  const accountFor = (named: number, actual: number) => {
    const missing = actual - named;
    if (named <= 0 || missing <= 0) return;
    push(
      say("partialGoals", {
        // Whole phrases, so "the other goal" does not come out as "the other
        // one goal".
        missing: missing === 1 ? "one more goal" : `${countWord(missing)} more goals`,
        others: missing === 1 ? "goal" : `${countWord(missing)} goals`,
        scorerNoun: missing === 1 ? "scorer" : "scorers",
      }),
    );
  };

  push(say("opening"));

  /* ------------------------------------------------------------- our goals */

  if (match.goalsFor > 0) {
    const scored = ours.filter((e) => !e.ownGoal);
    const own = ours.filter((e) => e.ownGoal);

    if (scored.length) {
      push(
        say("ourGoals", {
          names: scorerNames(scored),
          goalNoun: scored.length === 1 ? "goal" : "goals",
        }),
      );

      // The assist line follows the goal it set up, rather than trailing an
      // own goal that had nothing to do with it.
      const helpers = [...new Set(scored.map((e) => e.assist).filter((a): a is string => !!a))];
      if (helpers.length) {
        push(
          say("assists", {
            names: list(helpers),
            it: helpers.length > 1 ? "them" : "it",
            assistNoun: helpers.length > 1 ? "assists" : "assist",
          }),
        );
      }
    } else if (!ours.length) {
      // The goals went in but this fixture has no event detail.
      push(
        say("unknownGoals", {
          n: match.goalsFor,
          goalNoun: match.goalsFor === 1 ? "goal" : "goals",
        }),
      );
    }

    if (own.length) {
      push(
        say(own.length > 1 ? "ownGoals" : "ownGoal", {
          names: scorerNames(own),
          their: own.length > 1 ? "their" : "his",
        }),
      );
    }

    // A brace or better is worth saying out loud rather than leaving buried in
    // a list of minutes.
    for (const [name, goals] of goalsBy(scored)) {
      if (goals >= 4) push(say("bigHaul", { name, goals }));
      else if (goals === 3) push(say("hatTrick", { name }));
      else if (goals === 2) push(say("brace", { name }));
    }

    accountFor(scored.length + own.length, match.goalsFor);

    // Only a late goal that actually decided it earns a line. Any other one is
    // already in the scorer list with its minute, so saying it twice reads as
    // padding.
    const decided = match.outcome === "W" && match.goalsFor - match.goalsAgainst === 1;
    // The latest one, not the first late one: in a 3-2 won at the death it is
    // the 89th-minute goal that settled it, not an 86th-minute equaliser.
    const late = scored
      .filter((e) => lateMinute(e.minute))
      .sort((a, b) => minuteValue(b.minute) - minuteValue(a.minute))[0];
    if (decided && late) push(say("lateWinner", { scorer: late.scorer, minute: late.minute }));
  } else {
    push(say("blanked"));
  }

  /* ----------------------------------------------------------- their goals */

  // A goalless draw still kept a clean sheet, and it is worth saying, since
  // that is where two of the points came from.
  if (match.goalsAgainst === 0) {
    push(say("cleanSheet"));
  } else if (match.goalsAgainst > 0) {
    const conceded = theirs.filter((e) => !e.ownGoal);
    const ownAgainst = theirs.filter((e) => e.ownGoal);

    if (conceded.length) {
      push(
        say("theirGoals", {
          names: scorerNames(conceded),
          goalNoun: conceded.length === 1 ? "goal" : "goals",
        }),
      );
    }
    if (ownAgainst.length) {
      push(
        say(ownAgainst.length > 1 ? "ownGoals" : "ownGoal", {
          names: scorerNames(ownAgainst),
          their: ownAgainst.length > 1 ? "their" : "his",
        }),
      );
    }

    accountFor(conceded.length + ownAgainst.length, match.goalsAgainst);
  }

  push(say(match.points > 0 ? "points" : "noPoints", {
    n: match.points,
    unit: match.points === 1 ? "point" : "points",
  }));

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
