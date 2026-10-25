import type { Headline, MatchEvent, PlayedMatch } from "./types";

/**
 * Bumped whenever the wording below changes, so cached text written under an
 * older prompt is regenerated rather than lingering.
 */
export const PROMPT_VERSION = 2;

/**
 * What the model is told. Kept apart from the client so the wording of a
 * prompt can be read, and changed, without going near the transport.
 *
 * Every prompt follows the same shape: a list of facts drawn from ESPN, and an
 * instruction not to go beyond them. The model is doing the writing; it is not
 * being asked what happened.
 */

const NO_INVENTION = `Use ONLY the facts in the message. Do not add anything else — no stadium, no attendance, no manager, no quotes, no chances or saves you were not told about, no league-table implications, no opinion on who deserved it, no history between the clubs. If you are unsure whether something is in the facts, leave it out.`;

export const REPORT_SYSTEM = `You write short match reports for a side game in which a group of friends each own a Serie A club and score points from real results.

${NO_INVENTION}

Watch the home and away detail: the facts say which it was, and calling the away side "the hosts" is wrong.

Write one paragraph, 2 to 4 sentences, in British football prose. Dry and specific, with a little character. No heading, no list, no emoji, no markdown, no line breaks, no second person, and no remarks about the task itself. Finish with a short natural sentence giving the points earned, credited to the club by name. Not a "Points:" label, and do not invent anyone to receive them.

Output the report and nothing else.`;

export function reportFacts(input: {
  match: PlayedMatch;
  teamName: string;
  events: MatchEvent[] | null;
}): string {
  const { match, teamName } = input;
  const events = input.events ?? [];
  const ours = events.filter((e) => e.teamId === match.teamId);
  const theirs = events.filter((e) => e.teamId !== match.teamId);

  const describe = (e: MatchEvent) =>
    [
      e.ownGoal ? `own goal by ${e.scorer}` : e.scorer,
      e.minute ? ` ${e.minute}` : "",
      e.penalty ? " (penalty)" : "",
      !e.ownGoal && e.assist ? ` (assist ${e.assist})` : "",
    ].join("");

  const outcome =
    match.outcome === "W" ? "a win" : match.outcome === "D" ? "a draw" : "a defeat";

  const lines = [
    `Club: ${teamName}`,
    `Opponent: ${match.opponent}`,
    `Venue: ${match.home ? `${teamName} were at home` : `${teamName} were away`}`,
    `Competition: ${match.competitionName}`,
    `Result: ${teamName} ${match.goalsFor}-${match.goalsAgainst} ${match.opponent} — ${outcome} for ${teamName}`,
    match.viaPenalties ? `Settled by a penalty shootout, which ${teamName} ${match.outcome === "W" ? "won" : "lost"}.` : null,
    ours.length
      ? `${teamName} goals: ${ours.map(describe).join("; ")}`
      : match.goalsFor > 0
        ? `${teamName} scored ${match.goalsFor}, but no scorer is recorded.`
        : `${teamName} did not score.`,
    theirs.length
      ? `${match.opponent} goals: ${theirs.map(describe).join("; ")}`
      : match.goalsAgainst > 0
        ? `${match.opponent} scored ${match.goalsAgainst}, but no scorer is recorded.`
        : `${match.opponent} did not score.`,
  ];

  // Partial event detail is common, and has to be stated or the report will
  // quietly contradict its own scoreline.
  const named = (side: MatchEvent[]) => side.length;
  if (ours.length && named(ours) < match.goalsFor) {
    lines.push(
      `IMPORTANT: ${match.goalsFor - named(ours)} of ${teamName}'s goals have no recorded scorer. Say so; do not guess who scored.`,
    );
  }
  if (theirs.length && named(theirs) < match.goalsAgainst) {
    lines.push(
      `IMPORTANT: ${match.goalsAgainst - named(theirs)} of ${match.opponent}'s goals have no recorded scorer. Say so; do not guess who scored.`,
    );
  }

  lines.push(`Points earned: ${match.points}`);
  return lines.filter(Boolean).join("\n");
}

/* ------------------------------------------------------------ club digest */

export const DIGEST_SYSTEM = `You write a short "what's going on at the club" note for a side game in which friends own Serie A clubs.

You are given real headlines published about one club, with their summaries. ${NO_INVENTION} In particular: do not state a transfer as settled unless the headline does, do not add fees or dates, and do not predict anything. Rumour reported as rumour stays rumour.

Write about THIS club. The feed carries pieces about whoever they played, including the other side's reaction and their problems; that is not this club's news. Use a headline only for what it says about this club, and ignore the rest.

Write one paragraph, 2 to 3 sentences, British football prose, covering what the headlines actually say. If and only if nothing in them concerns this club, say it has been a quiet week — never alongside something the club actually did. No heading, no list, no emoji, no markdown, no line breaks, no second person.

Output the note and nothing else.`;

export function digestFacts(input: { teamName: string; headlines: Headline[] }): string {
  const lines = [`Club: ${input.teamName}`, "", "Published headlines:"];
  for (const h of input.headlines.slice(0, 8)) {
    lines.push(`- [${h.kind}] ${h.headline}${h.description ? ` — ${h.description}` : ""}`);
  }
  return lines.join("\n");
}
