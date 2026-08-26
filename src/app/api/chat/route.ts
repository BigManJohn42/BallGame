import { NextResponse } from "next/server";
import { cleanName } from "@/lib/game";
import { currentPlayer } from "@/lib/session";
import { getStore } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEP = Number.parseInt(process.env.CHAT_KEEP ?? "200", 10);
const MAX_LENGTH = Number.parseInt(process.env.CHAT_MAX_LENGTH ?? "500", 10);
const COOLDOWN_SECONDS = Number.parseInt(process.env.CHAT_COOLDOWN ?? "2", 10);

/**
 * Drops control characters, keeping tab and newline. Done by code point rather
 * than a regex class so there are no escape sequences to get wrong.
 */
function stripControl(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const keep = code === 9 || code === 10 || (code >= 32 && code !== 127);
    if (keep) out += ch;
  }
  return out;
}

/**
 * Trims the message to something sane. React escapes on render, so there is no
 * markup to strip — this is about length and stray control characters, not
 * safety.
 */
function cleanText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = stripControl(input).replace(/\n{3,}/g, "\n\n").trim();
  if (!text || text.length > MAX_LENGTH) return null;
  return text;
}

export async function GET(request: Request) {
  try {
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    const all = await getStore().listChat(KEEP);
    const messages =
      Number.isFinite(since) && since > 0 ? all.filter((m) => m.at > since) : all;

    return NextResponse.json(
      { messages, latest: all[0]?.at ?? 0, total: all.length },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load chat" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      text?: unknown;
      as?: unknown;
    };

    const text = cleanText(body.text);
    if (!text) {
      return NextResponse.json(
        { error: `Say something, up to ${MAX_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const store = getStore();

    // Whoever holds the cookie posts as themselves and is badged verified.
    // Anyone else picks a name from the list — fine for a game between friends,
    // but it proves nothing, so it does not get the badge.
    const me = await currentPlayer();
    let name: string | null = me?.name ?? null;
    let teamId: number | null = me?.teamId ?? null;
    let teamLogo: string | null = me?.teamLogo ?? null;
    const verified = Boolean(me);

    if (!me) {
      const claimedId = typeof body.as === "string" ? body.as : null;
      const claimed = claimedId ? await store.getPlayer(claimedId) : null;
      if (claimed) {
        name = claimed.name;
        teamId = claimed.teamId;
        teamLogo = claimed.teamLogo;
      } else {
        name = cleanName(body.as);
      }
    }

    if (!name) {
      return NextResponse.json({ error: "Pick who you are first." }, { status: 400 });
    }

    // One message every couple of seconds per person, so nobody can flood it.
    const allowed = await store.acquireLock(`chat:${name.toLowerCase()}`, COOLDOWN_SECONDS);
    if (!allowed) {
      return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      name,
      teamId,
      teamLogo,
      verified,
      text,
      at: Date.now(),
    };
    await store.pushChat(message, KEEP);

    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send" },
      { status: 500 },
    );
  }
}
