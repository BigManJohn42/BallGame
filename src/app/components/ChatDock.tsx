"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, GameState } from "@/lib/types";

const OPEN_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;
const IDENTITY_KEY = "ballgame:chat-as";

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * Chat, docked bottom-left and available from every tab.
 *
 * Whoever holds the player cookie posts as themselves. Anyone else picks a name
 * from the list — this is a game between friends, so that is deliberately not
 * locked down, but only cookie-backed messages get the verified badge.
 */
export default function ChatDock({ state }: { state: GameState }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [as, setAs] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);

  const listRef = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef(0);
  const openRef = useRef(false);

  const me = state.me;
  const players = state.leaderboard.map((r) => r.player);
  const identity = me ? me.name : players.find((p) => p.id === as)?.name ?? null;

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Remember the chosen name so it does not have to be picked every visit.
  useEffect(() => {
    if (me) return;
    const saved = window.localStorage.getItem(IDENTITY_KEY);
    if (saved) setAs(saved);
  }, [me]);

  useEffect(() => {
    if (!me && as) window.localStorage.setItem(IDENTITY_KEY, as);
  }, [as, me]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[]; latest: number };
      // The API returns newest first; render oldest first.
      const ordered = [...data.messages].reverse();
      setMessages(ordered);

      if (openRef.current) {
        seenRef.current = data.latest;
        setUnread(0);
      } else {
        setUnread(ordered.filter((m) => m.at > seenRef.current).length);
      }
    } catch {
      /* a dropped poll is not worth surfacing */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll briskly while open, slowly while closed just to keep the badge honest.
  useEffect(() => {
    const id = setInterval(
      () => {
        if (document.visibilityState !== "visible") return;
        load();
      },
      open ? OPEN_POLL_MS : IDLE_POLL_MS,
    );
    return () => clearInterval(id);
  }, [open, load]);

  // Stick to the bottom as messages arrive.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openChat() {
    setOpen(true);
    setUnread(0);
    seenRef.current = Date.now();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, as: me ? undefined : as }),
      });
      const data = (await res.json()) as { error?: string; message?: ChatMessage };
      if (!res.ok || !data.message) {
        setError(data.error ?? "Could not send.");
      } else {
        setText("");
        setMessages((prev) => [...prev, data.message as ChatMessage]);
        seenRef.current = data.message.at;
      }
    } catch {
      setError("Network hiccup. Try again.");
    }
    setSending(false);
  }

  const canPost = Boolean(me) || Boolean(as);

  return (
    <>
      <button
        className={`chat-fab${open ? " chat-fab-open" : ""}`}
        onClick={() => (open ? setOpen(false) : openChat())}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? "✕" : "💬"}
        {!open && unread > 0 ? <span className="chat-badge">{unread}</span> : null}
      </button>

      {open ? (
        <div className="chat-panel" role="dialog" aria-label="Chat">
          <div className="chat-head">
            <strong>Chat</strong>
            <span>{messages.length} messages</span>
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.length ? (
              messages.map((m) => {
                const mine = identity !== null && m.name === identity;
                return (
                  <div className={`chat-msg${mine ? " chat-mine" : ""}`} key={m.id}>
                    <div className="chat-meta">
                      {m.teamLogo ? <img src={m.teamLogo} alt="" loading="lazy" /> : null}
                      <b>{m.name}</b>
                      {m.verified ? (
                        <span className="chat-tick" title="Posted from this player's own browser">
                          ✓
                        </span>
                      ) : null}
                      <span className="chat-time" suppressHydrationWarning>
                        {timeFmt.format(new Date(m.at))}
                      </span>
                    </div>
                    <div className="chat-text">{m.text}</div>
                  </div>
                );
              })
            ) : (
              <div className="chat-empty">Nothing said yet. Go on.</div>
            )}
          </div>

          <div className="chat-foot">
            {me ? (
              <div className="chat-as">
                Posting as <b>{me.name}</b>
                <span className="chat-tick">✓</span>
              </div>
            ) : (
              <label className="chat-as">
                Posting as
                <select value={as} onChange={(e) => setAs(e.target.value)}>
                  <option value="">choose…</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.teamName})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <form className="chat-form" onSubmit={send}>
              <input
                className="input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={canPost ? "Say something…" : "Pick who you are first"}
                maxLength={500}
                disabled={!canPost || sending}
                aria-label="Message"
              />
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!canPost || sending || !text.trim()}
              >
                Send
              </button>
            </form>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
