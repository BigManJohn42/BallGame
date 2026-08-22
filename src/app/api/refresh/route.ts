import { NextResponse } from "next/server";
import { invalidateResults } from "@/lib/football";
import { getGameState } from "@/lib/game";
import { currentPlayer } from "@/lib/session";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COOLDOWN_SECONDS = Number.parseInt(process.env.REFRESH_COOLDOWN ?? "60", 10);

/**
 * Forces a re-read of results, at most once per cooldown window so an impatient
 * refresh button cannot hammer the upstream feed.
 */
export async function POST() {
  try {
    const allowed = await getStore().acquireLock("manual-refresh", COOLDOWN_SECONDS);
    if (allowed) await invalidateResults();

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
