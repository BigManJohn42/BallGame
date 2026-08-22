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

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
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
  /** Knockout competitions award progression bonuses; the league does not. */
  knockout: boolean;
  /** UEFA competitions have a league phase and a knockout playoff round. */
  europe: boolean;
  accent: string;
};

/**
 * Every competition scores a win and a draw the same. A club has no say in
 * which cups it ends up in, so paying more for one than another is really a
 * reward for last season — which the draw already accounts for.
 */
const WIN = envInt("POINTS_WIN", 3);
const DRAW = envInt("POINTS_DRAW", 1);

export const COMPETITIONS: Competition[] = [
  {
    id: 1,
    slug: envStr("LEAGUE_SLUG_SERIE_A", "ita.1"),
    key: "serie-a",
    name: "Serie A",
    short: "SA",
    win: WIN,
    draw: DRAW,
    knockout: false,
    europe: false,
    accent: "#3b82f6",
  },
  {
    id: 2,
    slug: envStr("LEAGUE_SLUG_CHAMPIONS_LEAGUE", "uefa.champions"),
    key: "ucl",
    name: "Champions League",
    short: "UCL",
    win: WIN,
    draw: DRAW,
    knockout: true,
    europe: true,
    accent: "#818cf8",
  },
  {
    id: 3,
    slug: envStr("LEAGUE_SLUG_EUROPA_LEAGUE", "uefa.europa"),
    key: "uel",
    name: "Europa League",
    short: "UEL",
    win: WIN,
    draw: DRAW,
    knockout: true,
    europe: true,
    accent: "#fb923c",
  },
  {
    id: 4,
    slug: envStr("LEAGUE_SLUG_CONFERENCE_LEAGUE", "uefa.europa.conf"),
    key: "uecl",
    name: "Conference League",
    short: "UECL",
    win: WIN,
    draw: DRAW,
    knockout: true,
    europe: true,
    accent: "#34d399",
  },
  {
    id: 5,
    slug: envStr("LEAGUE_SLUG_COPPA_ITALIA", "ita.coppa_italia"),
    key: "coppa",
    name: "Coppa Italia",
    short: "CI",
    win: WIN,
    draw: DRAW,
    knockout: true,
    europe: false,
    accent: "#f472b6",
  },
  {
    id: 6,
    slug: envStr("LEAGUE_SLUG_SUPERCOPPA", "ita.super_cup"),
    key: "supercoppa",
    name: "Supercoppa Italiana",
    short: "SC",
    win: WIN,
    draw: DRAW,
    knockout: true,
    europe: false,
    accent: "#fbbf24",
  },
];

const BY_ID = new Map(COMPETITIONS.map((c) => [c.id, c] as const));

export function competitionById(id: number): Competition | undefined {
  return BY_ID.get(id);
}

/** Serie A, the competition the draw pool is taken from. */
export const SERIE_A = COMPETITIONS[0];
