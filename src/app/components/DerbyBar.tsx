"use client";

import { useEffect, useState } from "react";
import type { Derby } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** One shared clock, so five countdowns do not mean five intervals. */
function useNow(active: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Countdown({ target, now }: { target: number; now: number | null }) {
  // Nothing until mounted: a server-rendered countdown is wrong on arrival.
  if (now === null) return <span className="countdown">&nbsp;</span>;

  const left = target - now;
  if (left <= 0) return <span className="countdown kicking">kicking off</span>;

  const { days, hours, minutes, seconds } = parts(left);
  return (
    <span className="countdown">
      {days > 0 ? (
        <>
          <b>{days}</b>d{" "}
        </>
      ) : null}
      <b>{String(hours).padStart(2, "0")}</b>h{" "}
      <b>{String(minutes).padStart(2, "0")}</b>m{" "}
      {days === 0 ? (
        <>
          <b>{String(seconds).padStart(2, "0")}</b>s
        </>
      ) : null}
    </span>
  );
}

function DerbyCard({
  derby,
  now,
  onPick,
}: {
  derby: Derby;
  now: number | null;
  onPick: (teamId: number) => void;
}) {
  const kickoff = Date.parse(derby.date);

  return (
    <div className="panel derby-card">
      <div className="derby-head">
        <div className="derby-eyebrow">
          {derby.hype?.rivalry ?? "Head-to-head"}
          <span className="derby-comp">{derby.competitionName}</span>
        </div>
        <Countdown target={kickoff} now={now} />
      </div>

      <div className="derby-fixture">
        <button className="derby-side" onClick={() => onPick(derby.homeTeamId)}>
          <img src={derby.homeLogo} alt="" />
          <span>
            <b>{derby.homeName}</b>
            {derby.homeOwner ? <em>{derby.homeOwner}</em> : null}
          </span>
        </button>

        <span className="derby-v">v</span>

        <button
          className="derby-side derby-side-right"
          onClick={() => onPick(derby.awayTeamId)}
        >
          <span>
            <b>{derby.awayName}</b>
            {derby.awayOwner ? <em>{derby.awayOwner}</em> : null}
          </span>
          <img src={derby.awayLogo} alt="" />
        </button>
      </div>

      <div className="derby-when" suppressHydrationWarning>
        {dateFmt.format(new Date(derby.date))}
      </div>

      {derby.hype ? (
        <>
          {derby.hype.rivalryNote ? (
            <p className="derby-note">{derby.hype.rivalryNote}</p>
          ) : null}
          <p className="derby-blurb">{derby.hype.blurb}</p>
          {derby.hype.facts.length ? (
            <div className="derby-facts">
              {derby.hype.facts.map((f) => (
                <span className="derby-fact" key={f.label}>
                  <em>{f.label}</em>
                  {f.value}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Every upcoming fixture between two clubs in the game, each with its own
 * countdown and write-up. These are the matches where one player's points come
 * straight out of another's, so they get the top of the page.
 */
export default function DerbyBar({
  derbies,
  onPick,
}: {
  derbies: Derby[];
  onPick: (teamId: number) => void;
}) {
  const now = useNow(derbies.length > 0);
  if (!derbies.length) return null;

  return (
    <section className="section derbies">
      <div className="section-head">
        <h2>
          {derbies.length > 1
            ? `${derbies.length} head-to-heads this round`
            : "Next head-to-head"}
        </h2>
        <span>your points against theirs</span>
      </div>
      <div className={`derby-grid${derbies.length > 1 ? " derby-grid-multi" : ""}`}>
        {derbies.map((d) => (
          <DerbyCard key={d.fixtureId} derby={d} now={now} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}
