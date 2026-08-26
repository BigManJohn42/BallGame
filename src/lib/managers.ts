import { getStore } from "./store";

/**
 * Current managers, read from Wikidata rather than hand-maintained.
 *
 * ESPN serves no coach data at all — the `coach` array on a match summary comes
 * back empty — so the alternative was a hand-written list that silently rots.
 * It did: four of seven were wrong within weeks of being written.
 *
 * Wikidata models this as "head coach" (P286) claims on the club, with an end
 * date (P582) added when someone leaves. A claim with no end date is the
 * incumbent. The club ids below are stable forever; only the claims move.
 */

const WIKIDATA = "https://www.wikidata.org/w/api.php";
const MANAGER_TTL = 60 * 60 * 12;

/** ESPN team id to Wikidata item. Verified by lookup, not guessed. */
const CLUB_ITEMS: Record<number, string> = {
  110: "Q631", // Internazionale
  114: "Q2641", // Napoli
  104: "Q2739", // AS Roma
  2572: "Q1120838", // Como
  103: "Q1543", // AC Milan
  111: "Q1422", // Juventus
  105: "Q1886", // Atalanta
};

type Claim = {
  rank?: string;
  qualifiers?: Record<string, unknown>;
  mainsnak?: { datavalue?: { value?: { id?: string } } };
};

type Entities = Record<string, { claims?: Record<string, Claim[]>; labels?: Record<string, { value?: string }> }>;

async function wikidata(params: Record<string, string>): Promise<Entities> {
  const url = new URL(WIKIDATA);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Wikidata returned HTTP ${res.status}`);
  const payload = (await res.json()) as { entities?: Entities };
  return payload.entities ?? {};
}

/** MANAGERS="110:Name" still wins, for when Wikidata is behind the news. */
function overrides(): Map<number, string> {
  const raw = process.env.MANAGERS;
  const out = new Map<number, string>();
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [id, ...name] = part.split(":");
    const teamId = Number.parseInt(id.trim(), 10);
    const manager = name.join(":").trim();
    if (Number.isFinite(teamId) && manager) out.set(teamId, manager);
  }
  return out;
}

async function fetchManagers(): Promise<Record<number, string>> {
  const items = Object.values(CLUB_ITEMS);
  const clubs = await wikidata({
    action: "wbgetentities",
    ids: items.join("|"),
    props: "claims",
  });

  // Collect the incumbent for each club: a head-coach claim with no end date.
  const wanted = new Map<number, string>();
  for (const [teamId, item] of Object.entries(CLUB_ITEMS)) {
    const claims = clubs[item]?.claims?.P286 ?? [];
    const current = claims.find(
      (c) => c.rank !== "deprecated" && !(c.qualifiers && "P582" in c.qualifiers),
    );
    const personId = current?.mainsnak?.datavalue?.value?.id;
    if (personId) wanted.set(Number(teamId), personId);
  }
  if (!wanted.size) return {};

  const people = await wikidata({
    action: "wbgetentities",
    ids: [...new Set(wanted.values())].join("|"),
    props: "labels",
    languages: "en",
  });

  const managers: Record<number, string> = {};
  for (const [teamId, personId] of wanted) {
    const name = people[personId]?.labels?.en?.value;
    if (name) managers[teamId] = name;
  }
  return managers;
}

/**
 * Cached for half a day. A sacking is news for about that long anyway, and a
 * failure just falls back to whatever the profile already said.
 */
export async function getManagers(): Promise<{
  managers: Record<number, string>;
  source: "wikidata" | "unavailable";
  checkedAt: number;
}> {
  const store = getStore();
  const key = "managers";
  type Cached = { managers: Record<number, string>; at: number };

  try {
    const cached = await store.cacheGet<Cached>(key);
    if (cached && Date.now() - cached.at < MANAGER_TTL * 1000) {
      return { managers: cached.managers, source: "wikidata", checkedAt: cached.at };
    }

    const managers = await fetchManagers();
    if (Object.keys(managers).length) {
      const at = Date.now();
      await store.cacheSet<Cached>(key, { managers, at }, 60 * 60 * 24 * 30);
      return { managers, source: "wikidata", checkedAt: at };
    }

    // Nothing came back but something may still be cached from before.
    if (cached) {
      return { managers: cached.managers, source: "wikidata", checkedAt: cached.at };
    }
  } catch {
    /* fall through to unavailable */
  }

  return { managers: {}, source: "unavailable", checkedAt: 0 };
}

/** Live manager for a club, or null to leave the hand-written one in place. */
export async function managerFor(teamId: number): Promise<{
  name: string | null;
  source: "override" | "wikidata" | "unavailable";
  checkedAt: number;
}> {
  const override = overrides().get(teamId);
  if (override) return { name: override, source: "override", checkedAt: Date.now() };

  const { managers, source, checkedAt } = await getManagers();
  return { name: managers[teamId] ?? null, source, checkedAt };
}
