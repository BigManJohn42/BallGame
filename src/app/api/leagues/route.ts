import { NextResponse } from "next/server";
import { checkCompetitions } from "@/lib/football";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Setup helper: confirms all six ESPN league slugs still resolve and reports how
 * many fixtures each currently has for the tracked season.
 */
export async function GET() {
  try {
    return NextResponse.json({ competitions: await checkCompetitions() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
