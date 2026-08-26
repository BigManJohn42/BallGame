import { clubProfile } from "./clubs";
import { cachedMatchEvents, getMatchEvents } from "./football";
import { managerFor } from "./managers";
import { buildReport, inForm } from "./reports";
import type { ClubNews, MatchEvent, PlayedMatch, Team } from "./types";

/**
 * Club news: a short report per finished match, plus who has been scoring
 * lately.
 *
 * Goal detail costs one request per fixture, so a club with a full season
 * behind it would be fifty requests on a cold cache. Instead, anything already
 * cached is used for free and only a small budget of the newest uncached
 * matches is fetched per call. Finished matches never change and are held for
 * weeks, so the archive fills in as the season goes and then stays put.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Newest uncached matches to fetch per club per request. */
const FETCH_BUDGET = envInt("NEWS_FETCH_BUDGET", 6);
/** How many matches back "in form" looks. */
const FORM_WINDOW = envInt("NEWS_FORM_WINDOW", 5);

export async function buildClubNews(input: {
  team: Team;
  played: PlayedMatch[];
}): Promise<ClubNews> {
  // getResults hands these back newest first.
  const matches = input.played.filter((m) => m.teamId === input.team.id);

  // Free pass: anything already in the cache.
  const cached = await Promise.all(
    matches.map(async (match) => ({
      match,
      events: await cachedMatchEvents(match.competitionId, match.fixtureId),
    })),
  );

  // Then spend the budget on the newest ones still missing detail.
  const missing = cached.filter((m) => m.events === null).slice(0, FETCH_BUDGET);
  const fetched = new Map<number, MatchEvent[] | null>();
  await Promise.all(
    missing.map(async ({ match }) => {
      fetched.set(
        match.fixtureId,
        await getMatchEvents(match.competitionId, match.fixtureId),
      );
    }),
  );

  const withEvents = cached.map((entry) => ({
    match: entry.match,
    events: entry.events ?? fetched.get(entry.match.fixtureId) ?? null,
  }));

  const manager = await managerFor(input.team.id).catch(() => ({
    name: null,
    source: "unavailable" as const,
    checkedAt: 0,
  }));
  const written = clubProfile(input.team.id)?.manager ?? null;

  return {
    teamId: input.team.id,
    teamName: input.team.name,
    teamLogo: input.team.logo,
    manager: manager.name ?? written,
    managerSource: manager.name ? manager.source : written ? "profile" : "unavailable",
    managerCheckedAt: manager.checkedAt,
    reports: withEvents.map(({ match, events }) =>
      buildReport({
        match,
        teamName: input.team.name,
        teamLogo: input.team.logo,
        events,
      }),
    ),
    form: inForm({ teamId: input.team.id, matches: withEvents, window: FORM_WINDOW }),
    pending: withEvents.filter((m) => m.events === null).length,
  };
}
