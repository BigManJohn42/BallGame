"use client";

import { useEffect, useState } from "react";
import type { Derby } from "@/lib/types";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function Countdown({ target }: { target: number }) {
  // Rendered only after mount: a server-rendered countdown would be wrong the
  // moment it reached the browser.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return <span className="countdown">&nbsp;</span>;

  const { days, hours, minutes, seconds } = parts(target - now);
  if (target - now <= 0) return <span className="countdown kicking">kicking off</span>;

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

/**
 * Counts down to the next fixture between two clubs in the game, and lists any
 * others in the same round. These are the matches where somebody's points come
 * straight out of somebody else's.
 */
export default function DerbyBar({
  derbies,
  onPick,
}: {
  derbies: Derby[];
  onPick: (teamId: number) => void;
}) {
  if (!derbies.length) return null;

  const [next, ...rest] = derbies;
  const kickoff = Date.parse(next.date);

  return (
    <div className="panel derby-bar">
      <div className="derby-lead">
        <div className="derby-eyebrow">
          Next head-to-head
          <span className="derby-comp">{next.competitionName}</span>
        </div>

        <div className="derby-fixture">
          <button className="derby-side" onClick={() => onPick(next.homeTeamId)}>
            <img src={next.homeLogo} alt="" />
            <span>
              <b>{next.homeName}</b>
              {next.homeOwner ? <em>{next.homeOwner}</em> : null}
            </span>
          </button>

          <span className="derby-v">v</span>

          <button className="derby-side derby-side-right" onClick={() => onPick(next.awayTeamId)}>
            <span>
              <b>{next.awayName}</b>
              {next.awayOwner ? <em>{next.awayOwner}</em> : null}
            </span>
            <img src={next.awayLogo} alt="" />
          </button>
        </div>

        <Countdown target={kickoff} />
      </div>

      {rest.length ? (
        <div className="derby-also">
          <span className="derby-also-label">Also this round</span>
          {rest.map((d) => (
            <span className="derby-chip" key={d.fixtureId}>
              <img src={d.homeLogo} alt="" />
              {d.homeName} v {d.awayName}
              <img src={d.awayLogo} alt="" />
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
