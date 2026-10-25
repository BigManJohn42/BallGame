import { aiEnabled, budgeter, write } from "./ai";
import { clubProfile } from "./clubs";
import { seedFrom } from "./grammar";
import { cachedMatchEvents, getClubHeadlines, getMatchEvents } from "./football";
import { managerFor } from "./managers";
import { DIGEST_SYSTEM, PROMPT_VERSION, REPORT_SYSTEM, digestFacts, reportFacts } from "./prompts";
import { buildReport, inForm } from "./reports";
import type { ClubNews, MatchEvent, MatchReport, PlayedMatch, Team } from "./types";

/**
 * Club news: a short report per finished match, plus who has been scoring
 * lately.
 *
 * Goal detail costs one request per fixture, so a club with a full season
 * behind it would be fifty requests on a cold cache. Instead, anything already
 * cached is used for free and only a small budget of the newest uncached
 * matches is fetched per call. Finished matches never change and are held for
 * weeks, so the archive fills in as the season goes and then stays put.
 *
 * With OPENROUTER_API_KEY set, the prose is written by a model from those same
 * facts, and cached the same way. Without it — or when a call fails, or the
 * per-request budget is spent — the generated prose in voice.ts is used, which
 * is what every report falls back to. The facts are identical either way.
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

  const headlines = await getClubHeadlines(input.team.id).catch(() => []);

  // Written locally first, so there is always a report to show.
  const reports: MatchReport[] = withEvents.map(({ match, events }) =>
    buildReport({ match, teamName: input.team.name, teamLogo: input.team.logo, events }),
  );

  // Then upgrade what the budget allows. A cached generation costs nothing, so
  // over a few visits the whole archive ends up written and stays written.
  let digest: string | null = null;
  if (aiEnabled()) {
    const spend = budgeter();

    // The digest goes first. It is one call covering the whole club and it is
    // the part that changes week to week, so it should not be starved by a
    // backlog of reports that will still be there next visit.
    if (headlines.length) {
      const facts = digestFacts({ teamName: input.team.name, headlines });
      digest = await write({
        // Keyed on the headlines themselves, so it is rewritten when the news
        // moves on and reused when it has not.
        cacheKey: `v${PROMPT_VERSION}:digest:${input.team.id}:${seedFrom(
          headlines.map((h) => h.headline).join("|"),
        )}`,
        system: DIGEST_SYSTEM,
        user: facts,
        facts: `${facts} ${input.team.name}`,
        spend,
      });
    }

    await Promise.all(
      reports.map(async (report, i) => {
        const { match, events } = withEvents[i];
        if (!report.detailed) return;
        const facts = reportFacts({ match, teamName: input.team.name, events });
        const text = await write({
          cacheKey: `v${PROMPT_VERSION}:report:${match.fixtureId}:${match.teamId}`,
          system: REPORT_SYSTEM,
          user: facts,
          facts: `${facts} ${input.team.name} ${match.opponent}`,
          spend,
        });
        if (text) {
          report.body = text;
          report.written = "ai";
        }
      }),
    );
  }

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
    headlines,
    digest,
    reports,
    form: inForm({ teamId: input.team.id, matches: withEvents, window: FORM_WINDOW }),
    pending: withEvents.filter((m) => m.events === null).length,
  };
}
