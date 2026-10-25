import type { Headline, MatchEvent, PlayedMatch } from "./types";

/**
 * Bumped whenever the wording below changes, so cached text written under an
 * older prompt is regenerated rather than lingering.
 */
export const PROMPT_VERSION = 4;

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

/* -------------------------------------------------------------- the hype */

export const HYPE_SYSTEM = `You write a short preview for an upcoming fixture in a side game where a group of friends each own a Serie A club and score points from real results. Two of their clubs are about to play each other, so whatever one owner gains, the other does not.

${NO_INVENTION} The head-to-head record, the league positions, the last meeting and the leading scorers are all given; use them and nothing else. If a rivalry note is included it is researched history and may be drawn on, but do not extend it with history of your own.

Do not predict a result or a scoreline, and do not say who should win.

Name both owners where they are given, early, and frame it as a meeting between them — the clubs are what they own, and the needle is between the two people. Only fall back to club names alone where an owner is not given.

Write one paragraph, 3 to 4 sentences, British football prose with a bit of needle. No heading, no list, no emoji, no markdown, no line breaks, no second person.

Output the preview and nothing else.`;

export function hypeFacts(input: {
  homeName: string;
  awayName: string;
  homeOwner: string | null;
  awayOwner: string | null;
  competition: string;
  rivalry: string | null;
  rivalryNote: string | null;
  tableLine: string | null;
  headToHead: string | null;
  lastMeeting: string | null;
  scorers: string[];
}): string {
  return [
    `Home club: ${input.homeName}${input.homeOwner ? ` — owned by ${input.homeOwner}` : ""}`,
    `Away club: ${input.awayName}${input.awayOwner ? ` — owned by ${input.awayOwner}` : ""}`,
    `Competition: ${input.competition}`,
    input.rivalry ? `This fixture is known as: ${input.rivalry}` : null,
    input.rivalryNote ? `Background (researched, may be used): ${input.rivalryNote}` : null,
    input.tableLine ? `League positions: ${input.tableLine}` : "The league table has nothing to say yet.",
    input.headToHead ? `Head-to-head record: ${input.headToHead}` : null,
    input.lastMeeting ? `Last meeting: ${input.lastMeeting}` : null,
    input.scorers.length ? `Leading scorers: ${input.scorers.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ----------------------------------------------------------- the week just gone */

export const ROUNDUP_SYSTEM = `You write a short round-up of the week for a side game where a group of friends each own a Serie A club and score points from real results.

${NO_INVENTION} You are given the table, what each owner gained, who moved and the best single result. Talk about the owners by name, since that is the competition.

Do not predict anything, and do not comment on form or momentum beyond the numbers given.

Write one paragraph, 2 to 4 sentences, British prose, light and a little needling. No heading, no list, no emoji, no markdown, no line breaks, no second person.

Output the round-up and nothing else.`;

export function roundupFacts(input: {
  standings: { rank: number; name: string; team: string; points: number; rankChange: number | null; pointsGained: number }[];
  matchesPlayed: number;
  bestResult: { player: string; opponent: string; home: boolean; goalsFor: number; goalsAgainst: number; competition: string; points: number } | null;
}): string {
  const lines = [`Matches played by these clubs this week: ${input.matchesPlayed}`, "", "Table:"];
  for (const s of input.standings) {
    const moved =
      s.rankChange === null || s.rankChange === 0
        ? "no change in position"
        : s.rankChange > 0
          ? `up ${s.rankChange}`
          : `down ${Math.abs(s.rankChange)}`;
    lines.push(
      `${s.rank}. ${s.name} (${s.team}) — ${s.points} points total, ${s.pointsGained} gained this week, ${moved}`,
    );
  }
  if (input.bestResult) {
    const r = input.bestResult;
    lines.push(
      "",
      `Best single result: ${r.player}'s club ${r.home ? "at home to" : "away at"} ${r.opponent}, ${r.goalsFor}-${r.goalsAgainst} in the ${r.competition}, worth ${r.points} points`,
    );
  }
  return lines.join("\n");
}
