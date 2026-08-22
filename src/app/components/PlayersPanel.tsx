"use client";

import { useEffect, useState } from "react";
import type { PlayerBoard } from "@/lib/types";

/**
 * Individual stat leaders among the clubs in the game. Fetched on demand: player
 * names cost a request each upstream, so this stays out of the main state.
 */
export default function PlayersPanel({ onPick }: { onPick: (teamId: number) => void }) {
  const [boards, setBoards] = useState<PlayerBoard[] | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/players", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          boards?: PlayerBoard[];
          notices?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.boards) setError(data.error ?? "Could not load player stats.");
        else {
          setBoards(data.boards);
          setNotices(data.notices ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Network hiccup. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="panel empty">{error}</div>;
  if (!boards) return <div className="panel empty">Loading player stats…</div>;

  const populated = boards.filter((b) => b.rows.length > 0);

  if (!populated.length) {
    return (
      <div className="panel empty">
        {notices[0] ??
          "No player statistics published for this season yet. They appear once the season is under way."}
      </div>
    );
  }

  return (
    <>
      {notices.length ? (
        <div className="notices">
          {notices.map((n, i) => (
            <div className="notice" key={i}>
              <span>⚠</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="boards">
        {populated.map((board) => (
          <div key={board.key}>
            <div className="section-head">
              <h2>{board.label}</h2>
              <span>{board.unit}</span>
            </div>
            <div className="panel">
              {board.rows.map((row, i) => (
                <div className="stat-row" key={row.athleteId}>
                  <span className={`stat-rank${i === 0 ? " rank-1" : ""}`}>{i + 1}</span>
                  <img src={row.teamLogo} alt="" loading="lazy" />
                  <button className="stat-name" onClick={() => onPick(row.teamId)}>
                    <span className="who">{row.name}</span>
                    <span className="club">{row.teamName}</span>
                  </button>
                  <span className="stat-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="footnote">
        Only players at the clubs in this game are listed, and totals are summed across
        all six competitions. Topping one of these categories is worth bonus points — see
        the Rules tab.
      </p>
    </>
  );
}
