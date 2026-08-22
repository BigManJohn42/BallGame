import type { DerbyHype, HeadToHead, LeagueRow } from "./types";

/**
 * The write-up above each head-to-head countdown.
 *
 * Everything factual is generated from real data — the head-to-head record and
 * previous meetings come from ESPN, positions from the live table, scorers from
 * the stat leaders. Only the rivalry names below are editorial, and they are
 * fixed pieces of history rather than anything that can go out of date.
 */

type Rivalry = { name: string; note: string };

/** Keyed on the two team ids sorted ascending, so order of the fixture is irrelevant. */
const RIVALRIES: Record<string, Rivalry> = {
  "103:110": {
    name: "Derby della Madonnina",
    note: "Two clubs, one stadium. Inter exist because a faction walked out of Milan in 1908, and San Siro has been split down the middle ever since.",
  },
  "110:111": {
    name: "Derby d'Italia",
    note: "Named by Gianni Brera for a reason: for most of the last century the title has gone through one of these two. There is no love lost and never has been.",
  },
  "104:112": {
    name: "Derby della Capitale",
    note: "Rome divided. One city, two clubs, and a fixture that has never been merely a football match.",
  },
  "104:114": {
    name: "Derby del Sole",
    note: "The derby of the sun — the south's two biggest clubs, and a rivalry that runs far hotter than the geography suggests.",
  },
  "103:111": {
    name: "The old rivalry",
    note: "Between them these two have more Italian titles and more European Cups than anyone else in the country. It has decided a lot of seasons.",
  },
  "110:114": {
    name: "Scudetto weather",
    note: "The north's establishment against the south's champions. Recent title races have come down to this pairing more than once.",
  },
};

function rivalryFor(a: number, b: number): Rivalry | null {
  const key = [a, b].sort((x, y) => x - y).join(":");
  return RIVALRIES[key] ?? null;
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function monthYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function buildHype(input: {
  homeTeamId: number;
  homeName: string;
  homeOwner: string | null;
  awayTeamId: number;
  awayName: string;
  awayOwner: string | null;
  competitionName: string;
  headToHead: HeadToHead | null;
  homeRow: LeagueRow | null;
  awayRow: LeagueRow | null;
  homeScorer: { name: string; goals: number } | null;
  awayScorer: { name: string; goals: number } | null;
}): DerbyHype {
  const rivalry = rivalryFor(input.homeTeamId, input.awayTeamId);
  const facts: { label: string; value: string }[] = [];
  const sentences: string[] = [];

  /* ------------------------------------------------------------- the stakes */

  if (input.homeOwner && input.awayOwner) {
    sentences.push(
      `${input.homeOwner} against ${input.awayOwner} — whatever one of them gains here, the other does not.`,
    );
  } else {
    sentences.push(
      `${input.homeName} against ${input.awayName} in the ${input.competitionName}.`,
    );
  }

  /* ---------------------------------------------------------- league context */

  const started = (row: LeagueRow | null) => row && row.played > 0;
  if (started(input.homeRow) && started(input.awayRow)) {
    const h = input.homeRow as LeagueRow;
    const a = input.awayRow as LeagueRow;
    sentences.push(
      `${h.name} come in ${ordinal(h.rank)} on ${h.points} ${
        h.points === 1 ? "point" : "points"
      }, ${a.name} ${ordinal(a.rank)} on ${a.points}.`,
    );
    facts.push({
      label: "In the table",
      value: `${ordinal(h.rank)} v ${ordinal(a.rank)}`,
    });
  } else {
    sentences.push("Neither has a league position worth the name yet — it is that early.");
  }

  /* -------------------------------------------------------------- the record */

  if (input.headToHead?.summary) {
    facts.push({ label: "Head-to-head", value: input.headToHead.summary });
  }

  const last = input.headToHead?.meetings?.[0];
  if (last) {
    const drawn = last.homeScore === last.awayScore;
    const winner = last.homeScore > last.awayScore ? last.homeName : last.awayName;
    sentences.push(
      drawn
        ? `They drew ${last.homeScore}-${last.awayScore} last time out, in ${monthYear(last.date)}.`
        : `${winner} took the last one ${Math.max(last.homeScore, last.awayScore)}-${Math.min(
            last.homeScore,
            last.awayScore,
          )}, back in ${monthYear(last.date)}.`,
    );
    facts.push({
      label: "Last meeting",
      value: `${last.homeName} ${last.homeScore}-${last.awayScore} ${last.awayName}`,
    });
  }

  /* ---------------------------------------------------------- who to watch */

  const watch: string[] = [];
  if (input.homeScorer) watch.push(`${input.homeScorer.name} (${input.homeScorer.goals})`);
  if (input.awayScorer) watch.push(`${input.awayScorer.name} (${input.awayScorer.goals})`);
  if (watch.length) {
    facts.push({ label: "Leading scorers", value: watch.join(" · ") });
    sentences.push(
      watch.length === 2
        ? `${input.homeScorer?.name} and ${input.awayScorer?.name} have been the ones finding the net.`
        : `${watch[0]} has been the one finding the net.`,
    );
  }

  return {
    rivalry: rivalry?.name ?? null,
    rivalryNote: rivalry?.note ?? null,
    blurb: sentences.join(" "),
    facts,
  };
}
