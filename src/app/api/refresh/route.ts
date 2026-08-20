import { NextResponse } from "next/server";
import { getDrawPool, invalidateResults } from "@/lib/football";
import { getGameState } from "@/lib/game";
import { currentPlayer } from "@/lib/session";
import { getStore } from "@/lib/store";
import type { Team } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COOLDOWN_SECONDS = Number.parseInt(process.env.REFRESH_COOLDOWN ?? "600", 10);

/**
 * Forces a re-read of results, at most once per cooldown window. The free API
 * plan has a daily request budget, so an impatient refresh button must not be
 * able to burn through it.
 */
export async function POST() {
  try {
    const store = getStore();
    const allowed = await store.acquireLock("manual-refresh", COOLDOWN_SECONDS);

    if (allowed) {
      const pool = await getDrawPool();
      const players = await store.listPlayers();
      const teams: Team[] = [...pool.teams];
      const known = new Set(teams.map((t) => t.id));
      for (const player of players) {
        if (!known.has(player.teamId)) {
          known.add(player.teamId);
          teams.push({
            id: player.teamId,
            name: player.teamName,
            logo: player.teamLogo,
            rank: player.teamRank,
          });
        }
      }
      await invalidateResults(teams);
    }

    const me = await currentPlayer();
    return NextResponse.json({
      refreshed: allowed,
      cooldownSeconds: COOLDOWN_SECONDS,
      state: await getGameState(me),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not refresh" },
      { status: 500 },
    );
  }
}
