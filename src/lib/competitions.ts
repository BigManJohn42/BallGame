/**
 * The six competitions we track, keyed by ESPN's league slugs.
 *
 * `id` is our own stable internal number (it is what travels through scoring
 * and the UI); `slug` is what ESPN's API actually wants in a URL. Both the slug
 * and the points values can be overridden with env vars.
 */

function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

export type Competition = {
  id: number;
  slug: string;
  key: string;
  name: string;
  short: string;
  /** Points for a win / draw in this competition. */
  win: number;
  draw: number;
  accent: string;
};

export const COMPETITIONS: Competition[] = [
  {
    id: 1,
    slug: envStr("LEAGUE_SLUG_SERIE_A", "ita.1"),
    key: "serie-a",
    name: "Serie A",
    short: "SA",
    win: 3,
    draw: 1,
    accent: "#3b82f6",
  },
  {
    id: 2,
    slug: envStr("LEAGUE_SLUG_CHAMPIONS_LEAGUE", "uefa.champions"),
    key: "ucl",
    name: "Champions League",
    short: "UCL",
    win: 6,
    draw: 2,
    accent: "#818cf8",
  },
  {
    id: 3,
    slug: envStr("LEAGUE_SLUG_EUROPA_LEAGUE", "uefa.europa"),
    key: "uel",
    name: "Europa League",
    short: "UEL",
    win: 4,
    draw: 2,
    accent: "#fb923c",
  },
  {
    id: 4,
    slug: envStr("LEAGUE_SLUG_CONFERENCE_LEAGUE", "uefa.europa.conf"),
    key: "uecl",
    name: "Conference League",
    short: "UECL",
    win: 3,
    draw: 1,
    accent: "#34d399",
  },
  {
    id: 5,
    slug: envStr("LEAGUE_SLUG_COPPA_ITALIA", "ita.coppa_italia"),
    key: "coppa",
    name: "Coppa Italia",
    short: "CI",
    win: 4,
    draw: 2,
    accent: "#f472b6",
  },
  {
    id: 6,
    slug: envStr("LEAGUE_SLUG_SUPERCOPPA", "ita.super_cup"),
    key: "supercoppa",
    name: "Supercoppa Italiana",
    short: "SC",
    win: 6,
    draw: 3,
    accent: "#fbbf24",
  },
];

const BY_ID = new Map(COMPETITIONS.map((c) => [c.id, c] as const));

export function competitionById(id: number): Competition | undefined {
  return BY_ID.get(id);
}

/** Serie A, the competition the draw pool is taken from. */
export const SERIE_A = COMPETITIONS[0];
