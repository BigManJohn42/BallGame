import { COMPETITIONS } from "./competitions";
import { athleteName, getLeaders, getLeagueTable, type StatLine } from "./football";
import { LEAGUE_FINISH, ROUNDS, STAT_AWARD_POINTS, TROPHY_POINTS, roundFor } from "./scoring";
import type { Award, PlayedMatch, Team, TeamScore, UpcomingMatch } from "./types";

/**
 * Bonus points that sit on top of match results: statistical awards, how far a
 * club got in each cup, and where it finished in Serie A.
 *
 * Statistical awards are contested **among the clubs in this game only**. The
 * Champions League top scorer is usually not a Serie A player, so a global
 * comparison would leave every award unclaimed and pointless.
 */

function bestOf(
  lines: StatLine[],
  eligible: Set<number>,
): { value: number; winners: StatLine[] } | null {
  const inPlay = lines.filter((l) => eligible.has(l.teamId) && l.value > 0);
  if (!inPlay.length) return null;
  const value = Math.max(...inPlay.map((l) => l.value));
  return { value, winners: inPlay.filter((l) => l.value === value) };
}

function combine(goals: StatLine[], assists: StatLine[]): StatLine[] {
  const merged = new Map<string, StatLine>();
  for (const line of [...goals, ...assists]) {
    const running = merged.get(line.athleteId);
    if (running) running.value += line.value;
    else merged.set(line.athleteId, { ...line });
  }
  return [...merged.values()].sort((a, b) => b.value - a.value);
}

export async function computeAwards(input: {
  teams: Team[];
  played: PlayedMatch[];
  upcoming: UpcomingMatch[];
  scores: Record<number, TeamScore>;
}): Promise<{ awards: Record<number, Award[]>; notices: string[] }> {
  const eligible = new Set(input.teams.map((t) => t.id));
  const awards: Record<number, Award[]> = {};
  const notices: string[] = [];
  const give = (teamId: number, award: Award) => {
    if (!eligible.has(teamId)) return;
    (awards[teamId] ??= []).push(award);
  };

  /* ------------------------------------------------ statistical awards */

  const leaders = await getLeaders();
  notices.push(...leaders.notices);

  const statAwards: [string, string, StatLine[], string][] = [
    ["top-scorer", "Top scorer", leaders.goals, "goals"],
    ["top-assister", "Top assister", leaders.assists, "assists"],
    [
      "top-contributor",
      "Most goals + assists",
      combine(leaders.goals, leaders.assists),
      "goal contributions",
    ],
    ["most-saves", "Most saves", leaders.saves, "saves"],
  ];

  const seasonOver = input.upcoming.length === 0;

  for (const [key, label, lines, unit] of statAwards) {
    const best = bestOf(lines, eligible);
    if (!best) continue;
    // Two players from the same club can tie for a category. The award belongs
    // to the club, so it is paid once no matter how many of its players share it.
    const perTeam = new Map<number, StatLine>();
    for (const winner of best.winners) {
      if (!perTeam.has(winner.teamId)) perTeam.set(winner.teamId, winner);
    }
    const winners = [...perTeam.values()];
    // Only the winners need a name lookup, so this is at most a few requests.
    const names = await Promise.all(winners.map((w) => athleteName(w.athleteId)));
    winners.forEach((winner, i) => {
      give(winner.teamId, {
        key,
        label,
        detail: `${names[i]} — ${best.value} ${unit}`,
        points: STAT_AWARD_POINTS,
        provisional: !seasonOver,
      });
    });
  }

  /* ---------------------------------------------------- most clean sheets */

  const sheets = input.teams
    .map((t) => ({ teamId: t.id, n: input.scores[t.id]?.cleanSheets ?? 0 }))
    .filter((s) => s.n > 0);
  if (sheets.length) {
    const most = Math.max(...sheets.map((s) => s.n));
    for (const s of sheets.filter((s) => s.n === most)) {
      give(s.teamId, {
        key: "most-clean-sheets",
        label: "Most clean sheets",
        detail: `${most} across all competitions`,
        points: STAT_AWARD_POINTS,
        provisional: !seasonOver,
      });
    }
  }

  /* ------------------------------------------------- cup progression */

  for (const competition of COMPETITIONS) {
    if (!competition.knockout) continue;

    const furthest = new Map<number, { rank: number; label: string; points: number }>();
    const finalsWon = new Set<number>();

    for (const match of input.played) {
      if (match.competitionId !== competition.id) continue;
      if (!eligible.has(match.teamId)) continue;
      const round = roundFor(match.round);
      if (!round) continue;

      const current = furthest.get(match.teamId);
      if (!current || round.rank > current.rank) {
        furthest.set(match.teamId, {
          rank: round.rank,
          label: round.label,
          points: round.points,
        });
      }
      if (round.key === "final" && match.outcome === "W") finalsWon.add(match.teamId);
    }

    // A club still alive in a round it has not finished yet still counts as
    // having reached it.
    for (const match of input.upcoming) {
      if (match.competitionId !== competition.id) continue;
      if (!eligible.has(match.teamId)) continue;
      const round = roundFor(match.round);
      if (!round) continue;
      const current = furthest.get(match.teamId);
      if (!current || round.rank > current.rank) {
        furthest.set(match.teamId, {
          rank: round.rank,
          label: round.label,
          points: round.points,
        });
      }
    }

    // A club with nothing left to play in this competition is out (or done), so
    // its run is settled and can no longer improve.
    const stillAlive = new Set(
      input.upcoming
        .filter((m) => m.competitionId === competition.id)
        .map((m) => m.teamId),
    );

    for (const [teamId, reached] of furthest) {
      const won = finalsWon.has(teamId);
      if (!won && reached.points === 0) continue; // league phase only
      give(teamId, {
        key: `${competition.key}-progress`,
        label: won ? `${competition.name} winners` : `${competition.name}: ${reached.label}`,
        detail: won ? "Trophy" : `Reached the ${reached.label.toLowerCase()}`,
        points: won ? TROPHY_POINTS : reached.points,
        provisional: !won && stillAlive.has(teamId),
      });
    }
  }

  /* -------------------------------------------------- Serie A finish */

  const serieA = COMPETITIONS[0];
  const table = await getLeagueTable();
  if (table.available) {
    const seasonDone = !input.upcoming.some((m) => m.competitionId === serieA.id);

    for (const team of input.teams) {
      const position = table.positions[team.id];
      if (!position) continue;

      let points = 0;
      let label = "";
      if (position === 1) {
        points = LEAGUE_FINISH.champions;
        label = "Serie A champions";
      } else if (position <= 4) {
        points = LEAGUE_FINISH.ucl;
        label = "Champions League qualification";
      } else if (position <= 6) {
        points = LEAGUE_FINISH.europa;
        label = "Europa League qualification";
      } else if (position === 7) {
        points = LEAGUE_FINISH.conference;
        label = "Conference League qualification";
      }
      if (!points) continue;

      give(team.id, {
        key: "league-finish",
        label,
        detail: seasonDone
          ? `Finished ${position}${ordinalSuffix(position)}`
          : `Currently ${position}${ordinalSuffix(position)} — not final until the season ends`,
        points,
        provisional: !seasonDone,
      });
    }
  }

  return { awards, notices };
}

function ordinalSuffix(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** Every award the game can hand out, for the rules panel. */
export function awardCatalogue() {
  return {
    stat: [
      { label: "Top scorer", points: STAT_AWARD_POINTS },
      { label: "Top assister", points: STAT_AWARD_POINTS },
      { label: "Most goals + assists", points: STAT_AWARD_POINTS },
      { label: "Most saves", points: STAT_AWARD_POINTS },
      { label: "Most clean sheets", points: STAT_AWARD_POINTS },
    ],
    rounds: ROUNDS.filter((r) => r.points > 0).map((r) => ({
      label: r.label,
      points: r.points,
    })).concat([{ label: "Win the trophy", points: TROPHY_POINTS }]),
    finish: [
      { label: "Serie A champions", points: LEAGUE_FINISH.champions },
      { label: "Top 4 (Champions League)", points: LEAGUE_FINISH.ucl },
      { label: "5th–6th (Europa League)", points: LEAGUE_FINISH.europa },
      { label: "7th (Conference League)", points: LEAGUE_FINISH.conference },
    ],
  };
}

