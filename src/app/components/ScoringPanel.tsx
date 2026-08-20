"use client";

import type { GameState } from "@/lib/types";

export default function ScoringPanel({ meta }: { meta: GameState["meta"] }) {
  return (
    <>
      <div className="panel rules">
        {meta.competitions.map((comp) => (
          <div className="rule-row" key={comp.id}>
            <div className="rule-name">
              <span className="comp-dot" style={{ background: comp.accent }} />
              {comp.name}
            </div>
            <div className="rule-values">
              <span>
                win <b>{comp.win}</b>
              </span>
              <span>
                draw <b>{comp.draw}</b>
              </span>
            </div>
          </div>
        ))}
        <div className="rule-row">
          <div className="rule-name">
            <span className="comp-dot" style={{ background: "var(--gold)" }} />
            Every competition
          </div>
          <div className="rule-values">
            <span>
              goal scored <b>+{meta.bonuses.goal}</b>
            </span>
            <span>
              clean sheet <b>+{meta.bonuses.cleanSheet}</b>
            </span>
          </div>
        </div>
      </div>
      <p className="footnote">
        A tie settled on penalties counts as a win for whoever went through, not a draw.
        Postponed and abandoned games are ignored until they are actually played. Ties on
        points are split by goal difference, then wins, then who joined first.
      </p>
    </>
  );
}
