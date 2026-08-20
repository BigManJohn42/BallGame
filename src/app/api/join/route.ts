import { NextResponse } from "next/server";
import { getDrawPool } from "@/lib/football";
import { cleanName, drawTeam, getGameState } from "@/lib/game";
import { COOKIE_MAX_AGE, PLAYER_COOKIE, currentPlayer, newToken } from "@/lib/session";
import { getStore } from "@/lib/store";
import type { Player } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_PLAYERS = Number.parseInt(process.env.MAX_PLAYERS ?? "200", 10);

export async function POST(request: Request) {
  try {
    // Already signed in on this browser: hand back the existing draw rather
    // than dealing a second club.
    const existing = await currentPlayer();
    if (existing) {
      return NextResponse.json({ player: existing, state: await getGameState(existing) });
    }

    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = cleanName(body.name);
    if (!name) {
      return NextResponse.json(
        { error: "Pick a name between 2 and 24 characters (letters, numbers, spaces)." },
        { status: 400 },
      );
    }

    const store = getStore();
    const [pool, players] = await Promise.all([getDrawPool(), store.listPlayers()]);

    if (!pool.teams.length) {
      return NextResponse.json(
        { error: "No teams available to draw from yet. Try again in a minute." },
        { status: 503 },
      );
    }
    if (players.length >= MAX_PLAYERS) {
      return NextResponse.json({ error: "This league is full." }, { status: 403 });
    }

    const id = crypto.randomUUID();
    const claimed = await store.claimName(name, id);
    if (!claimed) {
      return NextResponse.json(
        { error: `"${name}" is already playing. Pick another name.` },
        { status: 409 },
      );
    }

    const team = drawTeam(pool.teams, players);
    const player: Player = {
      id,
      name,
      teamId: team.id,
      teamName: team.name,
      teamLogo: team.logo,
      teamRank: team.rank,
      joinedAt: Date.now(),
    };

    const token = newToken();
    await store.savePlayer(player, token);

    const res = NextResponse.json({ player, state: await getGameState(player) });
    res.cookies.set(PLAYER_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not join" },
      { status: 500 },
    );
  }
}
