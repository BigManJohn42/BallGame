import { NextResponse } from "next/server";
import { hasApiKey, lookupLeagues } from "@/lib/football";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Setup helper. /api/leagues checks the six configured ids against your plan,
 * and /api/leagues?search=coppa finds an id if the provider ever renumbers one.
 * Costs one API request per league, so use it sparingly.
 */
export async function GET(request: Request) {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY is not set" }, { status: 400 });
  }
  const search = new URL(request.url).searchParams.get("search") ?? undefined;
  try {
    return NextResponse.json({ result: await lookupLeagues(search ?? undefined) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
