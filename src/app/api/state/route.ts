import { NextResponse } from "next/server";
import { getGameState } from "@/lib/game";
import { currentPlayer } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const me = await currentPlayer();
    const state = await getGameState(me);
    return NextResponse.json(state, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the game state" },
      { status: 500 },
    );
  }
}
