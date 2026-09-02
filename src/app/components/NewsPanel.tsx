"use client";

import { useEffect, useState } from "react";
import type { ClubNews, GameState } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function checkedLabel(at: number): string {
  if (!at) return "";
  const hours = Math.round((Date.now() - at) / 3_600_000);
  if (hours < 1) return "checked just now";
  if (hours < 24) return `checked ${hours}h ago`;
  return `checked ${Math.round(hours / 24)}d ago`;
}

/**
 * Match reports and recent form per club. Reports build up over the season and
 * stay put, so old ones can be read at any time.
 */
export default function NewsPanel({
  meta,
  onPick,
}: {
  meta: GameState["meta"];
  onPick: (teamId: number) => void;
}) {
  const [clubs, setClubs] = useState<ClubNews[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<number | "all">("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { clubs?: ClubNews[]; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.clubs) setError(data.error ?? "Could not load the news.");
        else setClubs(data.clubs);
      })
      .catch(() => {
        if (!cancelled) setError("Network hiccup. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="panel empty">{error}</div>;
  if (!clubs) return <div className="panel empty">Loading the news…</div>;
  if (!clubs.length) {
    return <div className="panel empty">No clubs in play yet.</div>;
  }

  const shown = filter === "all" ? clubs : clubs.filter((c) => c.teamId === filter);
  const accent = (id: number) =>
    meta.competitions.find((c) => c.id === id)?.accent ?? "#94a3b8";
  const totalReports = clubs.reduce((n, c) => n + c.reports.length, 0);
  const pending = clubs.reduce((n, c) => n + c.pending, 0);

  return (
    <>
      <div className="filters">
        <button
          className={`chip${filter === "all" ? " chip-on" : ""}`}
          onClick={() => setFilter("all")}
        >
          All clubs
        </button>
        {clubs.map((c) => (
          <button
            key={c.teamId}
            className={`chip${filter === c.teamId ? " chip-on" : ""}`}
            onClick={() => setFilter(c.teamId)}
          >
            <img src={c.teamLogo} alt="" className="chip-crest" />
            {c.teamName}
          </button>
        ))}
      </div>

      {totalReports === 0 ? (
        <div className="panel empty">
          Nothing to report yet — no matches have been played this season.
        </div>
      ) : null}

      {shown.map((club) => (
        <section className="news-club" key={club.teamId}>
          <div className="section-head">
            <h2>
              <button className="news-club-name" onClick={() => onPick(club.teamId)}>
                <img src={club.teamLogo} alt="" />
                {club.teamName}
              </button>
            </h2>
            <span>
              {club.manager ? (
                <>
                  {club.manager}
                  {club.managerSource === "wikidata" ? (
                    <em className="news-checked"> · {checkedLabel(club.managerCheckedAt)}</em>
                  ) : club.managerSource === "profile" ? (
                    <em className="news-checked"> · not verified</em>
                  ) : null}
                </>
              ) : null}
            </span>
          </div>

          {club.headlines.length ? (
            <div className="panel headlines">
              <div className="form-head">Around the club</div>
              {club.headlines.slice(0, 5).map((h) => (
                <a
                  className="headline"
                  key={h.headline}
                  href={h.url ?? undefined}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className={`kind kind-${h.kind}`}>{h.kind}</span>
                  <span className="headline-main">
                    <b>{h.headline}</b>
                    {h.description ? <em>{h.description}</em> : null}
                  </span>
                  <span className="headline-date" suppressHydrationWarning>
                    {h.published ? dateFmt.format(new Date(h.published)) : ""}
                  </span>
                </a>
              ))}
            </div>
          ) : null}

          {club.form.length ? (
            <div className="panel form-panel">
              <div className="form-head">In form — last few matches</div>
              <div className="form-players">
                {club.form.map((p) => (
                  <span className="form-player" key={p.name}>
                    <b>{p.name}</b>
                    <em>
                      {p.goals ? `${p.goals}G` : ""}
                      {p.goals && p.assists ? " " : ""}
                      {p.assists ? `${p.assists}A` : ""}
                    </em>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {club.reports.length ? (
            <div className="articles">
              {club.reports.map((r) => (
                <article className="panel article" key={r.fixtureId}>
                  <div className="article-head">
                    <span className={`outcome outcome-${r.outcome}`}>{r.outcome}</span>
                    <h3>{r.headline}</h3>
                    <span className={`pts${r.points === 0 ? " pts-0" : ""}`}>+{r.points}</span>
                  </div>
                  <div className="article-meta">
                    <span
                      className="comp-dot"
                      style={{ background: accent(r.competitionId) }}
                    />
                    {r.competitionName}
                    <span>·</span>
                    <span suppressHydrationWarning>{dateFmt.format(new Date(r.date))}</span>
                    {!r.detailed ? <span className="article-thin">scoreline only</span> : null}
                  </div>
                  <p className="article-body">{r.body}</p>
                  {r.scorers.length ? (
                    <div className="article-scorers">
                      {r.scorers.map((s, i) => (
                        <span key={`${s.name}-${i}`}>
                          {s.ownGoal ? "🙃" : "⚽"} {s.name} {s.minute}
                          {s.penalty ? " (pen)" : ""}
                          {s.ownGoal ? " (own goal)" : ""}
                          {s.assist ? <em> — {s.assist}</em> : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ))}

      <p className="footnote">
        Reports are written from the goals that actually went in, and are kept for the
        season — scroll back whenever. Goal detail is fetched a few matches at a time, so
        older reports fill in gradually
        {pending > 0 ? ` (${pending} still to load)` : ""}. Managers come from Wikidata and
        are re-checked twice a day.
      </p>
    </>
  );
}
