import { getStore } from "./store";

/**
 * Optional AI writing, through OpenRouter.
 *
 * The model is a writer, not a source. Every fact it is given comes from ESPN
 * first — scores, scorers, minutes, assists, real published headlines — and the
 * prompt forbids adding anything else. Output that mentions a name which was
 * not in the input is thrown away rather than shown, because a model asked
 * about football will happily supply a plausible stadium, a plausible scorer
 * and a plausible transfer, and none of them are checkable by the reader.
 *
 * Everything here degrades to null. With no key, a failed call, a timeout, a
 * spent budget or ungrounded output, the caller falls back to the generated
 * prose in voice.ts and the site is unchanged.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Default is a small, fast, non-reasoning model. Reasoning models are a poor
 * fit here: they spend the token budget thinking and return nothing, and they
 * are likelier to volunteer outside knowledge.
 */
const MODEL = process.env.AI_MODEL ?? "google/gemini-2.5-flash";
const TIMEOUT = envInt("AI_TIMEOUT_MS", 12_000);
const MAX_TOKENS = envInt("AI_MAX_TOKENS", 400);
/** Reports never change once written, so they are cached for a long time. */
const CACHE_TTL = envInt("AI_CACHE_TTL", 60 * 60 * 24 * 120);

export function aiEnabled(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function aiModel(): string {
  return MODEL;
}

/* ------------------------------------------------------------- grounding */

/**
 * Words a report may use without them appearing in the facts: football's own
 * vocabulary, and the calendar. Anything else capitalised mid-sentence is
 * treated as a name the model has introduced by itself.
 */
const SAFE = new Set(
  `a an and at the for of in on to by with from after before but or nor so yet
   i he she they it we you his her their its our your him them us
   serie coppa italia italiana supercoppa champions europa conference league cup
   uefa fifa var afc stadio arena stadium
   january february march april may june july august september october november december
   monday tuesday wednesday thursday friday saturday sunday
   first second third fourth fifth half time full minute minutes goal goals
   points point penalty penalties shootout own clean sheet brace hat
   trick assist assists win won draw drawn loss lost defeat victory
   no none nothing one two three four five six seven eight nine ten`
    .split(/\s+/)
    .filter(Boolean),
);

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
}

/**
 * True when every capitalised word in `text` also appears somewhere in
 * `facts`. Catches the invented scorer and the helpfully supplied stadium,
 * which are the two ways this goes wrong in practice.
 */
export function isGrounded(text: string, facts: string): boolean {
  const known = new Set(words(facts));
  // A capital after a stop or at the start is just a sentence opening.
  const stripped = text.replace(/(^|[.!?]\s+|["'“(]\s*)\p{Lu}/gu, (m) => m.toLowerCase());

  for (const match of stripped.matchAll(/\p{Lu}[\p{L}'’-]+/gu)) {
    const word = match[0].toLowerCase();
    if (word.length < 3) continue;
    if (SAFE.has(word)) continue;
    if (known.has(word)) continue;
    return false;
  }
  return true;
}

/* ------------------------------------------------------------ the client */

type Message = { role: "system" | "user"; content: string };

async function call(messages: Message[], maxTokens: number): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const abort = AbortSignal.timeout(TIMEOUT);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: abort,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        // OpenRouter attributes traffic with these; both are optional.
        "http-referer": process.env.SITE_URL ?? "https://ballgame.vercel.app",
        "x-title": "BallGame",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0.8,
        messages,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      error?: unknown;
      choices?: { finish_reason?: string; message?: { content?: unknown } }[];
    };
    if (json.error) return null;

    const choice = json.choices?.[0];
    // A truncated answer loses its final sentence, which is where the points
    // are stated, so it is no use to us.
    if (choice?.finish_reason === "length") return null;

    const content = choice?.message?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((b) => (typeof b === "string" ? b : ((b as { text?: string })?.text ?? ""))).join("")
          : "";

    const clean = text.replace(/\s*\n+\s*/g, " ").trim();
    return clean.length > 0 ? clean : null;
  } catch {
    // Timeout, network, bad JSON: the caller falls back.
    return null;
  }
}

/**
 * Generates text for `cacheKey`, reusing a previous answer when there is one.
 * Returns null whenever anything at all goes wrong.
 */
export async function write(input: {
  cacheKey: string;
  system: string;
  user: string;
  /** Everything the model is allowed to mention, for the grounding check. */
  facts: string;
  maxTokens?: number;
  /** Consulted only on a cache miss, so re-reads of written text are free. */
  spend?: () => boolean;
}): Promise<string | null> {
  const store = getStore();
  const key = `ai:${MODEL}:${input.cacheKey}`;

  const cached = await store.cacheGet<{ text: string }>(key).catch(() => null);
  if (cached?.text) return cached.text;

  if (!aiEnabled()) return null;
  if (input.spend && !input.spend()) return null;

  const text = await call(
    [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    input.maxTokens ?? MAX_TOKENS,
  );
  if (!text) return null;

  if (!isGrounded(text, `${input.facts} ${input.user}`)) return null;

  await store.cacheSet(key, { text }, CACHE_TTL).catch(() => {});
  return text;
}

/**
 * How many fresh generations one request may make. A cold cache must not stall
 * the page, so the rest fall back and get written on later visits.
 */
export const AI_BUDGET = envInt("AI_BUDGET", 8);

/** Hands out a shared budget across one request. */
export function budgeter(limit = AI_BUDGET) {
  let left = limit;
  return () => (left > 0 ? (left -= 1, true) : false);
}
