"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/types";

const CLUB_KEY = "ballgame:ask-club";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How's the season going?",
  "Who's been scoring?",
  "Who's the manager?",
  "How hard are the next few fixtures?",
  "Any news?",
];

/**
 * The club bot, docked bottom-right so it does not fight the chat on the left.
 *
 * Pick a club and talk to it. The answers come from a model that has been
 * handed that club's real record, table position, fixtures, scorers, manager
 * and published headlines, and told to say so when something is not in there.
 */
export default function AskBot({ state }: { state: GameState }) {
  const clubs = state.teams;

  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Default to the club this browser owns, else whatever was picked last.
  useEffect(() => {
    if (teamId !== null) return;
    const saved = Number(window.localStorage.getItem(CLUB_KEY));
    const remembered = clubs.find((c) => c.id === saved)?.id;
    setTeamId(state.me?.teamId ?? remembered ?? clubs[0]?.id ?? null);
  }, [clubs, state.me, teamId]);

  useEffect(() => {
    if (teamId !== null) window.localStorage.setItem(CLUB_KEY, String(teamId));
  }, [teamId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, asking]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const club = clubs.find((c) => c.id === teamId) ?? null;

  function switchClub(next: number) {
    setTeamId(next);
    // The conversation was about a different club; keeping it would let a
    // follow-up be answered against the wrong dossier.
    setTurns([]);
    setError(null);
  }

  async function send(question: string) {
    const asked = question.trim();
    if (!asked || asking || teamId === null) return;

    const next: Turn[] = [...turns, { role: "user", content: asked }];
    setTurns(next);
    setText("");
    setError(null);
    setAsking(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, messages: next }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };

      if (!res.ok || !data.answer) {
        setError(data.error ?? "That did not work.");
        // Put the question back so it is not lost to a failed call.
        setTurns(turns);
        setText(asked);
        return;
      }
      setTurns([...next, { role: "assistant", content: data.answer }]);
    } catch {
      setError("Could not reach the bot.");
      setTurns(turns);
      setText(asked);
    } finally {
      setAsking(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(text);
  }

  if (!clubs.length) return null;

  return (
    <>
      <button
        className={`ask-fab${open ? " ask-fab-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close the club bot" : "Ask about a club"}
      >
        {open ? "✕" : "⚽"}
      </button>

      {open ? (
        <div className="ask-panel" role="dialog" aria-label="Club bot">
          <div className="ask-head">
            <strong>Ask about a club</strong>
            <select
              className="ask-club"
              value={teamId ?? ""}
              onChange={(e) => switchClub(Number(e.target.value))}
            >
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ask-list" ref={listRef}>
            {turns.length === 0 ? (
              <div className="ask-intro">
                <p>
                  Anything about {club?.name ?? "this club"} — the season so far, who is
                  scoring, the manager, what is coming up, recent news.
                </p>
                <div className="ask-chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="ask-chip" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) => (
                <div key={i} className={`ask-turn ask-${t.role}`}>
                  {t.content}
                </div>
              ))
            )}

            {asking ? <div className="ask-turn ask-assistant ask-thinking">thinking…</div> : null}
          </div>

          {error ? <p className="ask-error">{error}</p> : null}

          <form className="ask-form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              className="input"
              value={text}
              maxLength={400}
              placeholder={club ? `Ask about ${club.name}…` : "Ask…"}
              onChange={(e) => setText(e.target.value)}
              disabled={asking}
            />
            <button className="btn btn-primary" disabled={asking || !text.trim()}>
              Ask
            </button>
          </form>

          <p className="ask-note">
            Answers come from this club&apos;s real results, table position, fixtures and
            published news. It will say when it does not have something.
          </p>
        </div>
      ) : null}
    </>
  );
}
