import { NextResponse } from "next/server";
import { getClubNews } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Match reports and recent form for the clubs in the game. Loaded on demand:
 * goal detail costs a request per fixture, so it stays out of the main state.
 */
export async function GET(request: Request) {
  try {
    const teamId = new URL(request.url).searchParams.get("team");
    const only = teamId ? Number.parseInt(teamId, 10) : null;
    const news = await getClubNews(Number.isFinite(only) ? only : null);
    return NextResponse.json({ clubs: news }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load news" },
      { status: 500 },
    );
  }
}
