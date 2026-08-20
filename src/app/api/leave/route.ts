import { NextResponse } from "next/server";
import { getGameState } from "@/lib/game";
import { PLAYER_COOKIE, currentPlayer } from "@/lib/session";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Drops the caller's own entry and frees their name. Nobody else is touched. */
export async function POST() {
  try {
    const me = await currentPlayer();
    if (me) await getStore().deletePlayer(me.id);

    const res = NextResponse.json({ ok: true, state: await getGameState(null) });
    res.cookies.set(PLAYER_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not leave" },
      { status: 500 },
    );
  }
}
