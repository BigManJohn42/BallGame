import { TRACK_SEASON, getClubHeadlines, getFullTable } from "./football";
import { getClubSeason } from "./game";
import { managerFor } from "./managers";
import type { LeagueRow, PlayedMatch, UpcomingMatch } from "./types";

/**
 * Everything the club bot is allowed to know, as one block of text.
 *
 * The bot is a real conversation with a model, but it answers from this and
 * nothing else. That is the whole design: asked "who plays up front for
 * Napoli", a model will produce a confident squad list from whenever its
 * training stopped, and the reader cannot tell that from the real thing. So
 * the club's actual record, table position, fixtures, scorers, manager and
 * published headlines go with every question, and the prompt tells it to say
 * when an answer is not in there.
 *
 * The hand-written parts — history, honours, legends — come from clubs.ts and
 * are the only prose here that was not fetched.
 */

const dateOnly = (iso: string) => (iso ?? "").slice(0, 10);

function resultLine(m: PlayedMatch): string {
  const where = m.home ? "home to" : "away at";
  const outcome = m.outcome === "W" ? "won" : m.outcome === "D" ? "drew" : "lost";
  const pens = m.viaPenalties ? " (on penalties)" : "";
  return `${dateOnly(m.date)} ${m.competitionName}: ${where} ${m.opponent}, ${outcome} ${m.goalsFor}-${m.goalsAgainst}${pens}, ${m.points} points`;
}

/**
 * "Difficulty" is not a rating anybody publishes, so the only honest version
 * of it is where the opponent actually sits. That is supplied, and the prompt
 * is told not to invent anything on top. Fixtures carry the opponent's name
 * but not its id, so the table is matched by name.
 */
function fixtureLine(m: UpcomingMatch, byName: Map<string, LeagueRow>): string {
  const where = m.home ? "home to" : "away at";
  const row = byName.get(m.opponent.toLowerCase());
  const standing =
    row && row.played > 0
      ? ` — ${m.opponent} are ${row.rank} in Serie A on ${row.points} points from ${row.played}, goal difference ${row.goalDifference}`
      : ` — ${m.opponent} are not in the Serie A table, so there is no league position to judge them by`;
  return `${dateOnly(m.date)} ${m.competitionName}: ${where} ${m.opponent}${standing}`;
}

export type ClubContext = { teamName: string; context: string };

export async function buildClubContext(teamId: number): Promise<ClubContext | null> {
  const club = await getClubSeason(teamId);
  if (!club) return null;

  const [manager, headlines, table] = await Promise.all([
    managerFor(teamId).catch(() => ({ name: null, source: "unavailable" as const, checkedAt: 0 })),
    getClubHeadlines(teamId).catch(() => []),
    getFullTable(TRACK_SEASON)
      .then((t) => t.rows)
      .catch(() => [] as LeagueRow[]),
  ]);

  const byName = new Map(table.map((r) => [r.name.toLowerCase(), r]));
  const p = club.profile;
  const s = club.score;
  const row = club.leagueRow;
  const lines: string[] = [];

  lines.push(`CLUB: ${club.team.name}`);
  if (p) {
    lines.push(
      `Founded ${p.founded}. Stadium: ${p.stadium}. Known as: ${p.nickname}.`,
      `History: ${p.history}`,
      p.honours.length ? `Honours: ${p.honours.join("; ")}` : "",
      p.legends.length ? `Great players of the past: ${p.legends.join(", ")}` : "",
    );
  }
  lines.push(
    manager.name
      ? `Current manager: ${manager.name}${manager.source === "wikidata" ? " (checked against Wikidata)" : ""}`
      : "Current manager: not known from the sources available.",
  );

  lines.push("", "IN THIS GAME");
  lines.push(
    club.owner ? `Owned by ${club.owner.name}.` : "Not yet drawn by any player.",
    `Points: ${s.points} in total — ${s.matchPoints} from matches, ${s.bonusPoints} from bonuses.`,
    `Record: ${s.played} played, ${s.wins} won, ${s.draws} drawn, ${s.losses} lost, ${s.goalsFor} scored, ${s.goalsAgainst} conceded, ${s.cleanSheets} clean sheets.`,
  );
  if (s.awards.length) {
    lines.push(`Bonus awards held: ${s.awards.map((a) => `${a.label} (${a.detail})`).join("; ")}`);
  }

  lines.push("", "SERIE A TABLE");
  lines.push(
    row && row.played > 0
      ? `${row.name} are ${row.rank} on ${row.points} points from ${row.played} played: ${row.wins} won, ${row.draws} drawn, ${row.losses} lost, goal difference ${row.goalDifference}.${row.zone ? ` That position is in the ${row.zone} places.` : ""}`
      : "The league table has nothing to say yet this season.",
  );

  if (club.topPlayers.length) {
    lines.push("", "LEADING PLAYERS AT THIS CLUB THIS SEASON");
    for (const board of club.topPlayers) {
      lines.push(
        `${board.label}: ${board.rows.map((r) => `${r.name} — ${r.value} ${board.unit}`).join(", ")}`,
      );
    }
  }

  if (club.played.length) {
    lines.push("", "RECENT RESULTS (newest first)");
    for (const m of club.played.slice(0, 12)) lines.push(resultLine(m));
  }

  if (club.upcoming.length) {
    lines.push("", "NEXT FIXTURES (soonest first)");
    for (const m of club.upcoming.slice(0, 6)) lines.push(fixtureLine(m, byName));
  }

  if (headlines.length) {
    lines.push("", "RECENTLY PUBLISHED ABOUT THIS CLUB");
    for (const h of headlines.slice(0, 8)) {
      lines.push(
        `[${h.kind}] ${dateOnly(h.published)} ${h.headline}${h.description ? ` — ${h.description}` : ""}`,
      );
    }
  }

  return { teamName: club.team.name, context: lines.filter((l) => l !== "").join("\n") };
}
