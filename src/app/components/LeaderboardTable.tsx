"use client";

import type { GameState, LeaderboardRow, Movement } from "@/lib/types";

function Move({ movement }: { movement: Movement | null }) {
  if (!movement || movement.rankChange === null || movement.rankChange === 0) {
    return <span className="move move-flat">–</span>;
  }
  const up = movement.rankChange > 0;
  return (
    <span className={`move ${up ? "move-up" : "move-down"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(movement.rankChange)}
    </span>
  );
}

function Gained({ movement }: { movement: Movement | null }) {
  if (!movement || movement.pointsGained <= 0) return null;
  return <span className="gained">+{movement.pointsGained} this week</span>;
}

/** Where a club's points came from, using the same colours as everywhere else. */
function Breakdown({
  byCompetition,
  competitions,
}: {
  byCompetition: Record<string, number>;
  competitions: GameState["meta"]["competitions"];
}) {
  const parts = competitions
    .map((c) => ({ ...c, value: byCompetition[c.key] ?? 0 }))
    .filter((c) => c.value > 0);
  if (!parts.length) return null;

  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div className="breakdown" title={parts.map((p) => `${p.name}: ${p.value}`).join(" · ")}>
      <div className="breakdown-bar">
        {parts.map((p) => (
          <span
            key={p.key}
            style={{ background: p.accent, width: `${(p.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="breakdown-keys">
        {parts.map((p) => (
          <span key={p.key}>
            <span className="comp-dot" style={{ background: p.accent }} />
            {p.short} {p.value}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LeaderboardTable({
  rows,
  meId,
  competitions,
  onPick,
}: {
  rows: LeaderboardRow[];
  meId: string | null;
  competitions: GameState["meta"]["competitions"];
  onPick: (teamId: number) => void;
}) {
  if (!rows.length) {
    return (
      <div className="panel empty">
        Nobody has joined yet. Be the first to draw a club.
      </div>
    );
  }

  return (
    <>
      {/* Wide screens: the full table. */}
      <div className="panel table-wrap only-wide">
        <table>
          <thead>
            <tr>
              <th className="rank">#</th>
              <th />
              <th>Player</th>
              <th className="num">Pts</th>
              <th className="num">Match</th>
              <th className="num">Bonus</th>
              <th className="num">P</th>
              <th className="num">W-D-L</th>
              <th className="num">GF-GA</th>
              <th className="num">Form</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player.id} className={row.player.id === meId ? "is-me" : undefined}>
                <td className={`rank${row.rank === 1 ? " rank-1" : ""}`}>{row.rank}</td>
                <td className="move-cell">
                  <Move movement={row.movement} />
                </td>
                <td>
                  <div className="player-cell">
                    <img src={row.player.teamLogo} alt="" loading="lazy" />
                    <div style={{ minWidth: 0 }}>
                      <div className="player-name">
                        {row.player.name}
                        {row.player.id === meId ? " (you)" : ""}
                        <Gained movement={row.movement} />
                      </div>
                      <button
                        className="player-team player-team-link"
                        onClick={() => onPick(row.player.teamId)}
                      >
                        {row.player.teamName} · fixtures &amp; results
                      </button>
                      {row.score.awards.length ? (
                        <div className="award-row">
                          {row.score.awards.map((a) => (
                            <span
                              className={`award${a.provisional ? " award-provisional" : ""}`}
                              key={a.key + a.label}
                              title={`${a.detail} · +${a.points}`}
                            >
                              {a.label} +{a.points}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <Breakdown
                        byCompetition={row.score.byCompetition}
                        competitions={competitions}
                      />
                    </div>
                  </div>
                </td>
                <td className="num points">{row.score.points}</td>
                <td className="num subtle">{row.score.matchPoints}</td>
                <td className="num subtle">
                  {row.score.bonusPoints ? `+${row.score.bonusPoints}` : "—"}
                </td>
                <td className="num">{row.score.played}</td>
                <td className="num">
                  {row.score.wins}-{row.score.draws}-{row.score.losses}
                </td>
                <td className="num">
                  {row.score.goalsFor}-{row.score.goalsAgainst}
                </td>
                <td className="num">
                  <div className="form-row">
                    {row.score.form.length ? (
                      row.score.form.map((f, i) => (
                        <span key={i} className={`pip pip-${f}`}>
                          {f}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "var(--dim)" }}>—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: cards, so nothing has to be scrolled sideways. */}
      <div className="cards only-narrow">
        {rows.map((row) => (
          <div
            className={`panel card${row.player.id === meId ? " is-me" : ""}`}
            key={row.player.id}
          >
            <div className="card-top">
              <div className={`card-rank${row.rank === 1 ? " rank-1" : ""}`}>{row.rank}</div>
              <img src={row.player.teamLogo} alt="" loading="lazy" />
              <div className="card-id">
                <div className="player-name">
                  {row.player.name}
                  {row.player.id === meId ? " (you)" : ""}
                </div>
                <button
                  className="player-team player-team-link"
                  onClick={() => onPick(row.player.teamId)}
                >
                  {row.player.teamName} · fixtures &amp; results
                </button>
              </div>
              <div className="card-points">
                <div className="value">{row.score.points}</div>
                <Move movement={row.movement} />
              </div>
            </div>

            <div className="card-stats">
              <span>
                <b>{row.score.matchPoints}</b> match
              </span>
              <span>
                <b>{row.score.bonusPoints ? `+${row.score.bonusPoints}` : "0"}</b> bonus
              </span>
              <span>
                <b>{row.score.played}</b> played
              </span>
              <span>
                <b>
                  {row.score.wins}-{row.score.draws}-{row.score.losses}
                </b>{" "}
                W-D-L
              </span>
              <div className="form-row">
                {row.score.form.map((f, i) => (
                  <span key={i} className={`pip pip-${f}`}>
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <Breakdown
              byCompetition={row.score.byCompetition}
              competitions={competitions}
            />

            {row.score.awards.length ? (
              <div className="award-row">
                {row.score.awards.map((a) => (
                  <span
                    className={`award${a.provisional ? " award-provisional" : ""}`}
                    key={a.key + a.label}
                    title={a.detail}
                  >
                    {a.label} +{a.points}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
