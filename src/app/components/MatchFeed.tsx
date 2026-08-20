"use client";

import type { GameState, PlayedMatch, UpcomingMatch } from "@/lib/types";

type Competitions = GameState["meta"]["competitions"];

function accentFor(comps: Competitions, id: number): string {
  return comps.find((c) => c.id === id)?.accent ?? "#94a3b8";
}

function teamNameFor(state: GameState, teamId: number): string {
  const fromPool = state.teams.find((t) => t.id === teamId);
  if (fromPool) return fromPool.name;
  return state.leaderboard.find((r) => r.player.teamId === teamId)?.player.teamName ?? "";
}

function logoFor(state: GameState, teamId: number): string {
  const fromPool = state.teams.find((t) => t.id === teamId);
  if (fromPool) return fromPool.logo;
  return state.leaderboard.find((r) => r.player.teamId === teamId)?.player.teamLogo ?? "";
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function Results({ state, matches }: { state: GameState; matches: PlayedMatch[] }) {
  if (!matches.length) {
    return (
      <div className="panel empty">
        No results counted yet for the {state.meta.trackSeason} season.
      </div>
    );
  }

  return (
    <div className="panel">
      {matches.map((m) => (
        <div className="match" key={`${m.fixtureId}-${m.teamId}`}>
          <img src={logoFor(state, m.teamId)} alt="" loading="lazy" />
          <div className="match-main">
            <div className="match-line">
              {teamNameFor(state, m.teamId)}{" "}
              <span style={{ color: "var(--dim)" }}>{m.home ? "vs" : "at"}</span> {m.opponent}
            </div>
            <div className="match-meta">
              <span
                className="comp-dot"
                style={{ background: accentFor(state.meta.competitions, m.competitionId) }}
              />
              {m.competitionName}
              <span>·</span>
              {/* Formatted in the viewer's timezone, so it differs from the SSR pass. */}
              <span suppressHydrationWarning>{dateFmt.format(new Date(m.date))}</span>
              {m.viaPenalties ? (
                <>
                  <span>·</span>
                  <span>on penalties</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="score">
            {m.goalsFor}–{m.goalsAgainst}
          </div>
          <div className={`pts${m.points === 0 ? " pts-0" : ""}`}>+{m.points}</div>
        </div>
      ))}
    </div>
  );
}

export function Fixtures({
  state,
  matches,
}: {
  state: GameState;
  matches: UpcomingMatch[];
}) {
  if (!matches.length) {
    return <div className="panel empty">No scheduled fixtures loaded.</div>;
  }

  return (
    <div className="panel">
      {matches.map((m) => (
        <div className="match" key={`${m.fixtureId}-${m.teamId}`}>
          <img src={logoFor(state, m.teamId)} alt="" loading="lazy" />
          <div className="match-main">
            <div className="match-line">
              {teamNameFor(state, m.teamId)}{" "}
              <span style={{ color: "var(--dim)" }}>{m.home ? "vs" : "at"}</span> {m.opponent}
            </div>
            <div className="match-meta">
              <span
                className="comp-dot"
                style={{ background: accentFor(state.meta.competitions, m.competitionId) }}
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
      ))}
    </div>
  );
}
