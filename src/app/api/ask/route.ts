import { NextResponse } from "next/server";
import { type Message, aiEnabled, converse } from "@/lib/ai";
import { buildClubContext } from "@/lib/clubContext";
import { getTrackedTeams } from "@/lib/game";
import { askSystem } from "@/lib/prompts";
import { currentPlayer } from "@/lib/session";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The club bot: a conversation with a model that has been handed one club's
 * real record, table position, fixtures, scorers, manager and headlines.
 *
 * Unlike the written reports this is open-ended user input, so it is the one
 * place where cost is not bounded by the data. Hence the length cap, the
 * cooldown and the short history: a question is a few hundred tokens of
 * context, and somebody holding down the send key should not be able to turn
 * that into a bill.
 */

const MAX_QUESTION = Number.parseInt(process.env.ASK_MAX_LENGTH ?? "400", 10);
const COOLDOWN_SECONDS = Number.parseInt(process.env.ASK_COOLDOWN ?? "4", 10);
/** Turns of back-and-forth kept, so follow-ups work without the cost running away. */
const KEEP_TURNS = Number.parseInt(process.env.ASK_KEEP_TURNS ?? "8", 10);

function stripControl(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || (code >= 32 && code !== 127)) out += ch;
  }
  return out;
}

function cleanTurns(raw: unknown): Message[] | null {
  if (!Array.isArray(raw)) return null;

  const turns: Message[] = [];
  for (const entry of raw.slice(-KEEP_TURNS)) {
    const role = (entry as { role?: unknown })?.role;
    const content = (entry as { content?: unknown })?.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;

    const text = stripControl(content).trim().slice(0, MAX_QUESTION);
    if (text) turns.push({ role, content: text });
  }

  // The model needs a question to answer, and it has to be the last thing said.
  if (!turns.length || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

export async function POST(request: Request) {
  try {
    if (!aiEnabled()) {
      return NextResponse.json(
        {
          error:
            "The club bot needs an OpenRouter key. Set OPENROUTER_API_KEY and redeploy.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      teamId?: unknown;
      messages?: unknown;
    };

    const teamId = Number(body.teamId);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: "Pick a club first." }, { status: 400 });
    }

    // Only the clubs actually in this game, so the endpoint cannot be used to
    // build a dossier on anything else.
    const teams = await getTrackedTeams();
    if (!teams.some((t) => t.id === teamId)) {
      return NextResponse.json({ error: "That club is not in this game." }, { status: 404 });
    }

    const messages = cleanTurns(body.messages);
    if (!messages) {
      return NextResponse.json(
        { error: `Ask something, up to ${MAX_QUESTION} characters.` },
        { status: 400 },
      );
    }

    // One question every few seconds each. The cookie identifies a player;
    // everyone else shares a per-club limit, which is enough for friends and
    // stops a loop running up a bill.
    const me = await currentPlayer();
    const who = me ? `p:${me.id}` : `club:${teamId}`;
    const allowed = await getStore().acquireLock(`ask:${who}`, COOLDOWN_SECONDS);
    if (!allowed) {
      return NextResponse.json({ error: "One at a time — give it a second." }, { status: 429 });
    }

    const club = await buildClubContext(teamId);
    if (!club) {
      return NextResponse.json({ error: "Could not load that club." }, { status: 404 });
    }

    const answer = await converse({ system: askSystem(club.context), messages });
    if (!answer) {
      return NextResponse.json(
        { error: "The bot could not answer that one. Try again in a moment." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { answer, teamName: club.teamName },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not ask that" },
      { status: 500 },
    );
  }
}
