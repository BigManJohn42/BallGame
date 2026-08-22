"use client";

import { useEffect, useState } from "react";
import type { ClubSeason, GameState } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * Every result and remaining fixture for one club. Opened from the leaderboard
 * or the league table, so anyone can inspect anyone else's season.
 */
export default function ClubPanel({
  teamId,
  meta,
  onClose,
}: {
  teamId: number;
  meta: GameState["meta"];
  onClose: () => void;
}) {
  const [club, setClub] = useState<ClubSeason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<number | "all">("all");

  useEffect(() => {
    let cancelled = false;
    setClub(null);
    setError(null);

    fetch(`/api/club/${teamId}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as ClubSeason & { error?: string };
        if (cancelled) return;
        if (!res.ok) setError(data.error ?? "Could not load that club.");
        else setClub(data);
      })
      .catch(() => {
        if (!cancelled) setError("Network hiccup. Try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // Escape closes, and the page behind must not scroll while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const accent = (id: number) =>
    meta.competitions.find((c) => c.id === id)?.accent ?? "#94a3b8";

  const played = club
    ? club.played.filter((m) => filter === "all" || m.competitionId === filter)
    : [];
  const upcoming = club
    ? club.upcoming.filter((m) => filter === "all" || m.competitionId === filter)
    : [];

  // Only offer filters for competitions this club actually appears in.
  const involved = club
    ? meta.competitions.filter((c) =>
        club.played.some((m) => m.competitionId === c.id) ||
        club.upcoming.some((m) => m.competitionId === c.id),
      )
    : [];

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Club season"
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {error ? <div className="empty">{error}</div> : null}
        {!club && !error ? <div className="empty">Loading…</div> : null}

        {club ? (
          <>
            <div className="sheet-head">
              <div className="crest">
                <img src={club.team.logo} alt="" />
              </div>
              <div className="sheet-title">
                <h2>{club.team.name}</h2>
                <p>
                  {club.owner ? `Played by ${club.owner.name}` : "Not drawn by anyone"}
                  {club.leaguePosition ? ` · ${club.leaguePosition} in Serie A` : ""}
                </p>
              </div>
              <div className="myclub-stats">
                <div className="stat">
                  <div className="value">{club.score.points}</div>
                  <div className="label">Points</div>
                </div>
                <div className="stat">
                  <div className="value">{club.score.matchPoints}</div>
                  <div className="label">Match</div>
                </div>
                <div className="stat">
                  <div className="value">{club.score.bonusPoints}</div>
                  <div className="label">Bonus</div>
                </div>
              </div>
            </div>

            {club.score.awards.length ? (
              <div className="sheet-awards">
                {club.score.awards.map((a) => (
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

            <div className="filters">
              <button
                className={`chip${filter === "all" ? " chip-on" : ""}`}
                onClick={() => setFilter("all")}
              >
                All ({club.played.length + club.upcoming.length})
              </button>
              {involved.map((c) => (
                <button
                  key={c.id}
                  className={`chip${filter === c.id ? " chip-on" : ""}`}
                  onClick={() => setFilter(c.id)}
                >
                  <span className="comp-dot" style={{ background: c.accent }} />
                  {c.short}
                </button>
              ))}
            </div>

            <div className="sheet-cols">
              <div>
                <div className="section-head">
                  <h2>Results</h2>
                  <span>{played.length}</span>
                </div>
                <div className="panel">
                  {played.length ? (
                    played.map((m) => (
                      <div className="match" key={`${m.fixtureId}-r`}>
                        <span
                          className={`outcome outcome-${m.outcome}`}
                          title={m.viaPenalties ? "on penalties" : undefined}
                        >
                          {m.outcome}
                        </span>
                        <div className="match-main">
                          <div className="match-line">
                            {m.home ? "vs" : "at"} {m.opponent}
                          </div>
                          <div className="match-meta">
                            <span
                              className="comp-dot"
                              style={{ background: accent(m.competitionId) }}
                            />
                            {m.competitionName}
                            <span>·</span>
                            <span suppressHydrationWarning>
                              {dateFmt.format(new Date(m.date))}
                            </span>
                          </div>
                        </div>
                        <div className="score">
                          {m.goalsFor}–{m.goalsAgainst}
                        </div>
                        <div className={`pts${m.points === 0 ? " pts-0" : ""}`}>
                          +{m.points}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty">No results yet.</div>
                  )}
                </div>
              </div>

              <div>
                <div className="section-head">
                  <h2>Fixtures</h2>
                  <span>{upcoming.length}</span>
                </div>
                <div className="panel">
                  {upcoming.length ? (
                    upcoming.map((m) => (
                      <div className="match" key={`${m.fixtureId}-f`}>
                        <img src={m.opponentLogo} alt="" loading="lazy" />
                        <div className="match-main">
                          <div className="match-line">
                            {m.home ? "vs" : "at"} {m.opponent}
                          </div>
                          <div className="match-meta">
                            <span
                              className="comp-dot"
                              style={{ background: accent(m.competitionId) }}
                            />
                            {m.competitionName}
                          </div>
                        </div>
                        <div
                          className="score"
                          style={{ fontWeight: 500, color: "var(--muted)" }}
                          suppressHydrationWarning
                        >
                          {dateFmt.format(new Date(m.date))}
                          <span style={{ color: "var(--dim)", marginLeft: 8 }}>
                            {timeFmt.format(new Date(m.date))}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty">Nothing scheduled.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
