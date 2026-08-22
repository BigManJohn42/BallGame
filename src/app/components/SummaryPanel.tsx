"use client";

import { useState } from "react";
import type { WeeklySummary } from "@/lib/types";

export default function SummaryPanel({ summary }: { summary: WeeklySummary }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!summary.since) {
    return (
      <div className="panel empty">
        Nothing to summarise yet. Once a gameweek has been played this shows who
        gained, who climbed and the result of the week.
      </div>
    );
  }

  return (
    <>
      <div className="highlights">
        <div className="panel highlight">
          <div className="label">Most points</div>
          {summary.topEarner ? (
            <>
              <div className="value">+{summary.topEarner.pointsGained}</div>
              <div className="who">
                {summary.topEarner.name} · {summary.topEarner.team}
              </div>
            </>
          ) : (
            <div className="who">Nobody scored this week</div>
          )}
        </div>

        <div className="panel highlight">
          <div className="label">Biggest climb</div>
          {summary.biggestClimb ? (
            <>
              <div className="value">▲{summary.biggestClimb.rankChange}</div>
              <div className="who">
                {summary.biggestClimb.name} · now {summary.biggestClimb.rank}
              </div>
            </>
          ) : (
            <div className="who">No changes in order</div>
          )}
        </div>

        <div className="panel highlight">
          <div className="label">Result of the week</div>
          {summary.bestResult ? (
            <>
              <div className="value">
                {summary.bestResult.goalsFor}–{summary.bestResult.goalsAgainst}
              </div>
              <div className="who">
                {summary.bestResult.player} {summary.bestResult.home ? "vs" : "at"}{" "}
                {summary.bestResult.opponent} · +{summary.bestResult.points}
              </div>
            </>
          ) : (
            <div className="who">No matches played</div>
          )}
        </div>

        <div className="panel highlight">
          <div className="label">Matches counted</div>
          <div className="value">{summary.matchesPlayed}</div>
          <div className="who">since the last gameweek</div>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 24 }}>
        <h2>Share</h2>
        <span>paste it into the group chat</span>
      </div>
      <div className="panel share">
        <pre>{summary.text}</pre>
        <button className="btn btn-primary" onClick={copy}>
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>
    </>
  );
}
