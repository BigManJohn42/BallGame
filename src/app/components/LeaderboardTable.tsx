"use client";

import type { LeaderboardRow } from "@/lib/types";

export default function LeaderboardTable({
  rows,
  meId,
}: {
  rows: LeaderboardRow[];
  meId: string | null;
}) {
  if (!rows.length) {
    return (
      <div className="panel empty">
        Nobody has joined yet. Be the first to draw a club.
      </div>
    );
  }

  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th className="rank">#</th>
            <th>Player</th>
            <th className="num">Pts</th>
            <th className="num">Match</th>
            <th className="num">Bonus</th>
            <th className="num">P</th>
            <th className="num">W-D-L</th>
            <th className="num">GF-GA</th>
            <th className="num">CS</th>
            <th className="num">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.player.id} className={row.player.id === meId ? "is-me" : undefined}>
              <td className={`rank${row.rank === 1 ? " rank-1" : ""}`}>{row.rank}</td>
              <td>
                <div className="player-cell">
                  <img src={row.player.teamLogo} alt="" loading="lazy" />
                  <div style={{ minWidth: 0 }}>
                    <div className="player-name">
                      {row.player.name}
                      {row.player.id === meId ? " (you)" : ""}
                    </div>
                    <div className="player-team">{row.player.teamName}</div>
                    {row.score.awards.length ? (
                      <div className="award-row">
                        {row.score.awards.map((a) => (
                          <span
                            className={`award${a.provisional ? " award-provisional" : ""}`}
                            key={a.key}
                            title={`${a.detail} · +${a.points}`}
                          >
                            {a.label} +{a.points}
                          </span>
                        ))}
                      </div>
                    ) : null}
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
              <td className="num">{row.score.cleanSheets}</td>
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
  );
}
