"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ChatDock from "./ChatDock";
import ClubPanel from "./ClubPanel";
import DerbyBar from "./DerbyBar";
import LeaderboardTable from "./LeaderboardTable";
import LeagueTable from "./LeagueTable";
import LiveNow from "./LiveNow";
import NewsPanel from "./NewsPanel";
import PlayersPanel from "./PlayersPanel";
import SummaryPanel from "./SummaryPanel";
import { Fixtures, Results } from "./MatchFeed";
import ScoringPanel from "./ScoringPanel";
import type { GameState, Team } from "@/lib/types";

const POLL_MS = 60_000;
const SPIN_MS = 1900;

const TABS = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "table", label: "Serie A" },
  { id: "news", label: "News" },
  { id: "players", label: "Players" },
  { id: "matches", label: "Fixtures" },
  { id: "summary", label: "This week" },
  { id: "rules", label: "Rules" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Game({ initial }: { initial: GameState }) {
  const [state, setState] = useState<GameState>(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spin, setSpin] = useState<Team | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [openClub, setOpenClub] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("leaderboard");

  const spinning = useRef(false);
  const cycleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  // The tab lives in the URL hash so a particular view can be linked to, and so
  // reloading does not bounce you back to the leaderboard.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (TABS.some((t) => t.id === id)) setTab(id as TabId);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const selectTab = useCallback((id: TabId) => {
    setTab(id);
    // replaceState keeps the back button meaning "leave the site", not "undo
    // six tab clicks".
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  useEffect(
    () => () => {
      if (cycleTimer.current) clearInterval(cycleTimer.current);
      if (stopTimer.current) clearTimeout(stopTimer.current);
    },
    [],
  );

  // Keep the shared leaderboard current while friends are drawing.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible" || spinning.current) return;
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as GameState;
        if (!spinning.current) setState(next);
      } catch {
        /* a dropped poll is not worth surfacing */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const runDraw = useCallback((next: GameState) => {
    const pool = next.teams.length ? next.teams : [];
    const target = next.me;
    if (!pool.length || !target) {
      setState(next);
      setBusy(false);
      return;
    }

    spinning.current = true;
    let i = Math.floor(Math.random() * pool.length);
    setSpin(pool[i]);
    cycleTimer.current = setInterval(() => {
      i = (i + 1) % pool.length;
      setSpin(pool[i]);
    }, 95);

    stopTimer.current = setTimeout(() => {
      if (cycleTimer.current) clearInterval(cycleTimer.current);
      cycleTimer.current = null;
      spinning.current = false;
      setSpin(null);
      setState(next);
      setRevealed(true);
      setBusy(false);
    }, SPIN_MS);
  }, []);

  async function join(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { error?: string; state?: GameState };
      if (!res.ok || !data.state) {
        setError(data.error ?? "Could not join.");
        setBusy(false);
        return;
      }
      setName("");
      runDraw(data.state);
    } catch {
      setError("Network hiccup. Try that again.");
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        refreshed?: boolean;
        cooldownSeconds?: number;
        state?: GameState;
      };
      if (!res.ok || !data.state) {
        setError(data.error ?? "Could not refresh.");
      } else {
        setState(data.state);
        setStatus(
          data.refreshed
            ? "Pulled fresh results from the provider."
            : `Showing cached results — a manual refresh is allowed every ${Math.round(
                (data.cooldownSeconds ?? 600) / 60,
              )} minutes to protect the free API quota.`,
        );
      }
    } catch {
      setError("Network hiccup. Try that again.");
    }
    setBusy(false);
  }

  async function leave() {
    if (!window.confirm("Leave the game? Your club and points are given up.")) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/leave", { method: "POST" });
      const data = (await res.json()) as { state?: GameState };
      if (data.state) setState(data.state);
      setRevealed(false);
    } catch {
      setError("Network hiccup. Try that again.");
    }
    setBusy(false);
  }

  const me = state.me;
  const myRow = me ? state.leaderboard.find((r) => r.player.id === me.id) : undefined;
  const displayTeam: Team | null = spin
    ? spin
    : me
      ? { id: me.teamId, name: me.teamName, logo: me.teamLogo, rank: me.teamRank }
      : null;

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <div className="brand-mark">⚽</div>
          <div>
            <h1>BallGame</h1>
            <p>
              Draw a club from the Serie A {state.meta.drawSeason} top {state.teams.length}, then
              live and die by their {state.meta.trackSeason} results.
            </p>
          </div>
        </div>
        <div className="masthead-side">
          <span className={`tag ${state.meta.resultsSource === "live" ? "tag-live" : "tag-warn"}`}>
            <span className="dot" />
            {state.meta.resultsSource === "live" ? "Live data" : "No live data"}
          </span>
          <span className="tag">
            {state.leaderboard.length} player{state.leaderboard.length === 1 ? "" : "s"}
          </span>
          <button className="btn btn-ghost" onClick={refresh} disabled={busy}>
            Refresh
          </button>
        </div>
      </header>

      {state.meta.notices.length ? (
        <div className="notices">
          {state.meta.notices.map((notice, i) => (
            <div className="notice" key={i}>
              <span>⚠</span>
              <span>{notice}</span>
            </div>
          ))}
        </div>
      ) : null}

      {displayTeam ? (
        <div className={`panel myclub${spin ? " drawing" : ""}`}>
          <div className="crest">
            <img src={displayTeam.logo} alt="" />
          </div>
          <div className={`myclub-body${revealed && !spin ? " revealed" : ""}`}>
            <p className="eyebrow">{spin ? "Drawing your club" : `${me?.name} plays as`}</p>
            <h2>{spin ? "…" : displayTeam.name}</h2>
            <p className="sub">
              {spin
                ? "Shuffling the top seven"
                : `Finished ${ordinal(displayTeam.rank)} in Serie A ${state.meta.drawSeason}`}
            </p>
          </div>
          {!spin && myRow ? (
            <div className="myclub-stats">
              <div className="stat">
                <div className="value">{myRow.score.points}</div>
                <div className="label">Points</div>
              </div>
              <div className="stat">
                <div className="value">#{myRow.rank}</div>
                <div className="label">Position</div>
              </div>
              <div className="stat">
                <div className="value">{myRow.score.played}</div>
                <div className="label">Played</div>
              </div>
            </div>
          ) : null}
          {!spin ? (
            <button className="btn btn-ghost" onClick={leave} disabled={busy}>
              Leave
            </button>
          ) : null}
        </div>
      ) : (
        <div className="panel join">
          <div>
            <h2>Get your club</h2>
            <p>
              Put your name in and the app deals you one of the seven clubs that finished top of
              Serie A in {state.meta.drawSeason}. Everything they do in{" "}
              {state.meta.trackSeason} — league, Europe and both domestic cups — scores points for
              you.
            </p>
          </div>
          <form className="join-form" onSubmit={join}>
            <input
              className="input"
              placeholder="Your name"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              aria-label="Your name"
            />
            <button className="btn btn-primary" type="submit" disabled={busy || name.trim().length < 2}>
              {busy ? "Drawing…" : "Deal me a club"}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          <div className="pool">
            {state.teams.map((team) => (
              <span className="pool-chip" key={team.id}>
                <img src={team.logo} alt="" loading="lazy" />
                {team.name}
                <b>{ordinal(team.rank)}</b>
                <button
                  className="pool-view"
                  onClick={() => setOpenClub(team.id)}
                  aria-label={`View `}
                >
                  View
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && displayTeam ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
      {status ? (
        <p className="footnote" style={{ marginTop: 12 }}>
          {status}
        </p>
      ) : null}

      <DerbyBar derbies={state.derbies} onPick={setOpenClub} />

      {/* Live matches sit above the tabs: if something is being played right
          now, it is the most interesting thing on the page whatever tab you are
          reading. */}
      <LiveNow matches={state.live} meta={state.meta} onPick={setOpenClub} />

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " tab-on" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
            {t.id === "summary" && state.summary.matchesPlayed > 0 ? (
              <span className="tab-badge">{state.summary.matchesPlayed}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <section className="section" role="tabpanel">
        {tab === "leaderboard" ? (
          <>
            <div className="section-head">
              <h2>Leaderboard</h2>
              <span suppressHydrationWarning>
                {mounted && state.meta.lastUpdated
                  ? `Results as of ${new Date(state.meta.lastUpdated).toLocaleString()}`
                  : ""}
              </span>
            </div>
            <LeaderboardTable
              rows={state.leaderboard}
              meId={me?.id ?? null}
              competitions={state.meta.competitions}
              onPick={setOpenClub}
            />
          </>
        ) : null}

        {tab === "table" ? (
          <>
            <div className="section-head">
              <h2>Serie A {state.meta.trackSeason}</h2>
              <span>the real table · clubs in play are highlighted</span>
            </div>
            <LeagueTable
              rows={state.table}
              inGame={new Set(state.leaderboard.map((r) => r.player.teamId))}
              onPick={setOpenClub}
            />
          </>
        ) : null}

        {tab === "news" ? <NewsPanel meta={state.meta} onPick={setOpenClub} /> : null}

        {tab === "players" ? <PlayersPanel onPick={setOpenClub} /> : null}

        {tab === "summary" ? <SummaryPanel summary={state.summary} /> : null}

        {tab === "matches" ? (
          <div className="grid-2">
            <div>
              <div className="section-head">
                <h2>Latest results</h2>
                <span>points scored</span>
              </div>
              <Results state={state} matches={state.recent} />
            </div>
            <div>
              <div className="section-head">
                <h2>Coming up</h2>
                <span>all six competitions</span>
              </div>
              <Fixtures state={state} matches={state.upcoming} />
            </div>
          </div>
        ) : null}

        {tab === "rules" ? (
          <>
            <div className="section-head">
              <h2>How points work</h2>
              <span>every value is configurable</span>
            </div>
            <ScoringPanel meta={state.meta} />
          </>
        ) : null}
      </section>

      <ChatDock state={state} />

      {openClub !== null ? (
        <ClubPanel
          teamId={openClub}
          meta={state.meta}
          onClose={() => setOpenClub(null)}
        />
      ) : null}
    </div>
  );
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
