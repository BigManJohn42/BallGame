import { NextResponse } from "next/server";
import { getClubSeason } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * A club's full season: every result and every remaining fixture. Deliberately
 * public — the point is that anyone can look up anyone else's club.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const id = Number.parseInt(teamId, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Not a team id" }, { status: 400 });
    }

    const club = await getClubSeason(id);
    if (!club) {
      return NextResponse.json({ error: "That club is not in this game" }, { status: 404 });
    }

    return NextResponse.json(club, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load that club" },
      { status: 500 },
    );
  }
}
