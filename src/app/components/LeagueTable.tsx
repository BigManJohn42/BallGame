"use client";

import type { LeagueRow } from "@/lib/types";

/**
 * The real Serie A table, entirely separate from the player leaderboard. Clubs
 * that somebody holds in the game are highlighted and clickable.
 */
export default function LeagueTable({
  rows,
  inGame,
  onPick,
}: {
  rows: LeagueRow[];
  inGame: Set<number>;
  onPick: (teamId: number) => void;
}) {
  if (!rows.length) {
    return <div className="panel empty">The Serie A table has not loaded.</div>;
  }

  const kickedOff = rows.some((r) => r.played > 0);

  return (
    <div className="panel table-wrap">
      <table className="league-table">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th>Club</th>
            <th className="num">P</th>
            <th className="num">W</th>
            <th className="num">D</th>
            <th className="num">L</th>
            <th className="num">GF</th>
            <th className="num">GA</th>
            <th className="num">GD</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const playing = inGame.has(row.teamId);
            return (
              <tr key={row.teamId} className={playing ? "is-me" : undefined}>
                <td className="rank">
                  <span
                    className="zone-bar"
                    style={{ background: row.zoneColor ?? "transparent" }}
                    title={row.zone ?? undefined}
                  />
                  {kickedOff ? row.rank : "–"}
                </td>
                <td>
                  {playing ? (
                    <button className="club-link" onClick={() => onPick(row.teamId)}>
                      <img src={row.logo} alt="" loading="lazy" />
                      <span>{row.name}</span>
                      <span className="in-game">in play</span>
                    </button>
                  ) : (
                    <div className="club-link club-static">
                      <img src={row.logo} alt="" loading="lazy" />
                      <span>{row.name}</span>
                    </div>
                  )}
                </td>
                <td className="num">{row.played}</td>
                <td className="num">{row.wins}</td>
                <td className="num">{row.draws}</td>
                <td className="num">{row.losses}</td>
                <td className="num">{row.goalsFor}</td>
                <td className="num">{row.goalsAgainst}</td>
                <td className="num">
                  {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                </td>
                <td className="num points">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
