import { NextResponse } from "next/server";
import { getDrawPool, invalidateResults } from "@/lib/football";
import { getGameState } from "@/lib/game";
import { getStore } from "@/lib/store";
import type { Team } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hit daily by the Vercel cron in vercel.json. Refetches every tracked club so
 * the leaderboard is already warm when someone opens the page.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const store = getStore();
    const [pool, players] = await Promise.all([getDrawPool(), store.listPlayers()]);

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
    const state = await getGameState(null);

    return NextResponse.json({
      ok: true,
      teams: teams.length,
      players: players.length,
      matchesCounted: state.leaderboard.reduce((n, row) => n + row.score.played, 0),
      notices: state.meta.notices,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
