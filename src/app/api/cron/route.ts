import { NextResponse } from "next/server";
import { invalidateResults } from "@/lib/football";
import { getGameState } from "@/lib/game";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hit daily by the Vercel cron in vercel.json. Refetches every competition so
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
    await invalidateResults();
    const state = await getGameState(null);

    return NextResponse.json({
      ok: true,
      players: (await getStore().listPlayers()).length,
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
