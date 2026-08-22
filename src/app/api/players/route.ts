import { NextResponse } from "next/server";
import { getPlayerBoards } from "@/lib/football";
import { getTrackedTeams } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Individual stat leaders among the clubs in this game. Loaded on demand rather
 * than with the main state, because resolving player names costs a request each.
 */
export async function GET() {
  try {
    const teams = await getTrackedTeams();
    return NextResponse.json(await getPlayerBoards(teams), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load player stats" },
      { status: 500 },
    );
  }
}
