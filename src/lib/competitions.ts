/**
 * API-Football (v3) league ids for the six competitions we track.
 * Every id can be overridden with an env var in case the provider renumbers one.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export type Competition = {
  id: number;
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
    id: envInt("LEAGUE_ID_SERIE_A", 135),
    key: "serie-a",
    name: "Serie A",
    short: "SA",
    win: 3,
    draw: 1,
    accent: "#3b82f6",
  },
  {
    id: envInt("LEAGUE_ID_CHAMPIONS_LEAGUE", 2),
    key: "ucl",
    name: "Champions League",
    short: "UCL",
    win: 6,
    draw: 2,
    accent: "#818cf8",
  },
  {
    id: envInt("LEAGUE_ID_EUROPA_LEAGUE", 3),
    key: "uel",
    name: "Europa League",
    short: "UEL",
    win: 4,
    draw: 2,
    accent: "#fb923c",
  },
  {
    id: envInt("LEAGUE_ID_CONFERENCE_LEAGUE", 848),
    key: "uecl",
    name: "Conference League",
    short: "UECL",
    win: 3,
    draw: 1,
    accent: "#34d399",
  },
  {
    id: envInt("LEAGUE_ID_COPPA_ITALIA", 137),
    key: "coppa",
    name: "Coppa Italia",
    short: "CI",
    win: 4,
    draw: 2,
    accent: "#f472b6",
  },
  {
    id: envInt("LEAGUE_ID_SUPERCOPPA", 547),
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

export function isTracked(leagueId: number): boolean {
  return BY_ID.has(leagueId);
}

/** Serie A id, used for the draw standings. */
export const SERIE_A_ID = COMPETITIONS[0].id;
