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
      <div className="rules-grid">
        <div className="panel rules">
          <div className="rule-head">Statistical awards</div>
          {meta.awardCatalogue.stat.map((a) => (
            <div className="rule-row" key={a.label}>
              <div className="rule-name">{a.label}</div>
              <div className="rule-values">
                <b>+{a.points}</b>
              </div>
            </div>
          ))}
        </div>

        <div className="panel rules">
          <div className="rule-head">Cup progress</div>
          {meta.awardCatalogue.rounds.map((a) => (
            <div className="rule-row" key={a.label}>
              <div className="rule-name">{a.label}</div>
              <div className="rule-values">
                <b>+{a.points}</b>
              </div>
            </div>
          ))}
        </div>

        <div className="panel rules">
          <div className="rule-head">Serie A finish</div>
          {meta.awardCatalogue.finish.map((a) => (
            <div className="rule-row" key={a.label}>
              <div className="rule-name">{a.label}</div>
              <div className="rule-values">
                <b>+{a.points}</b>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="footnote">
        The three European competitions score identically — a club does not choose which one
        it plays in, so rewarding one above another would just be a second prize for last
        season. Statistical awards are contested <strong>between the clubs in this game</strong>,
        not against all of Europe, and only the highest cup round reached is paid out rather
        than every round along the way. Anything still contestable is shown faded and can be
        taken away again before the season ends.
      </p>
      <p className="footnote">
        A tie settled on penalties counts as a win for whoever went through, not a draw.
        Postponed and abandoned games are ignored until they are actually played. Ties on
        points are split by goal difference, then wins, then who joined first.
      </p>
    </>
  );
}
