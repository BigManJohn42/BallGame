import type { Derby, UpcomingMatch } from "./types";

/**
 * Fixtures where both clubs belong to someone in the game. These are the
 * matches where one player's gain is another's loss, so they get a countdown at
 * the top of the page.
 *
 * getResults emits one upcoming entry per tracked club, so a fixture between two
 * of them appears twice under the same id. That duplication is the signal.
 */

/**
 * How far past the first one to keep announcing, so a whole round goes up
 * together rather than the entire rest of the season. A Serie A round spans
 * Friday to Monday, hence four days.
 */
function roundWindowMs(): number {
  const raw = process.env.DERBY_WINDOW_HOURS;
  const hours = raw ? Number.parseInt(raw, 10) : NaN;
  return (Number.isFinite(hours) && hours > 0 ? hours : 96) * 60 * 60 * 1000;
}

export function findDerbies(input: {
  upcoming: UpcomingMatch[];
  owners: Map<number, string>;
  competitionName: (id: number) => string;
  now: number;
}): Derby[] {
  const byFixture = new Map<number, UpcomingMatch[]>();
  for (const match of input.upcoming) {
    const list = byFixture.get(match.fixtureId);
    if (list) list.push(match);
    else byFixture.set(match.fixtureId, [match]);
  }

  const derbies: Derby[] = [];
  for (const [fixtureId, sides] of byFixture) {
    // Both clubs tracked means two entries for the same fixture.
    if (sides.length < 2) continue;
    // Each entry is written from its own club's point of view, so the home
    // club's name lives on the away entry's `opponent` field, and vice versa.
    const home = sides.find((s) => s.home);
    const away = sides.find((s) => !s.home);
    if (!home || !away) continue;

    const kickoff = Date.parse(home.date);
    if (!Number.isFinite(kickoff) || kickoff < input.now) continue;

    derbies.push({
      fixtureId,
      date: home.date,
      competitionId: home.competitionId,
      competitionName: input.competitionName(home.competitionId),
      homeTeamId: home.teamId,
      homeName: away.opponent,
      homeLogo: away.opponentLogo,
      homeOwner: input.owners.get(home.teamId) ?? null,
      awayTeamId: away.teamId,
      awayName: home.opponent,
      awayLogo: home.opponentLogo,
      awayOwner: input.owners.get(away.teamId) ?? null,
      hype: null,
    });
  }

  derbies.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!derbies.length) return [];

  // Announce the next one and anything else in the same round, not the whole
  // remaining season.
  const first = Date.parse(derbies[0].date);
  const window = roundWindowMs();
  return derbies.filter((d) => Date.parse(d.date) - first <= window);
}
