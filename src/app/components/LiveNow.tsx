"use client";

import type { GameState, LiveMatch } from "@/lib/types";

/**
 * Matches being played right now. These score nothing until the final whistle —
 * the points column deliberately shows what is at stake, not what is banked.
 */
export default function LiveNow({
  matches,
  meta,
  onPick,
}: {
  matches: LiveMatch[];
  meta: GameState["meta"];
  onPick: (teamId: number) => void;
}) {
  if (!matches.length) return null;

  const accent = (id: number) =>
    meta.competitions.find((c) => c.id === id)?.accent ?? "#94a3b8";

  // A derby between two tracked clubs arrives once per club; show it once.
  const seen = new Set<number>();
  const unique = matches.filter((m) => {
    if (seen.has(m.fixtureId)) return false;
    seen.add(m.fixtureId);
    return true;
  });

  return (
    <section className="section">
      <div className="section-head">
        <h2>
          <span className="live-dot" /> Live now
        </h2>
        <span>not counted until full time</span>
      </div>
      <div className="panel">
        {unique.map((m) => (
          <div className="match live-row" key={m.fixtureId}>
            <button className="live-team" onClick={() => onPick(m.teamId)}>
              {m.home ? "vs" : "at"} {m.opponent}
            </button>
            <div className="match-main">
              <div className="match-meta">
                <span
                  className="comp-dot"
                  style={{ background: accent(m.competitionId) }}
                />
                {m.competitionName}
                <span>·</span>
                {m.phase}
              </div>
            </div>
            <div className="live-score">
              {m.goalsFor}–{m.goalsAgainst}
            </div>
            <div className="live-clock">{m.clock}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
